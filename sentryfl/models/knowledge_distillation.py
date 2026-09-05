"""
Knowledge Distillation Module: Model compression for edge deployment

This module implements knowledge distillation to compress federated models,
enabling lightweight student models that maintain performance while reducing
model size for edge device deployment.

Key Features:
- Teacher model loading (federated global model)
- Student model initialization with smaller architecture
- Temperature scaling for soft prediction smoothing
- Distillation loss (KL divergence between teacher and student)
- Hard label loss (cross-entropy with ground truth)
- Combined loss with configurable weighting
- Model size reduction logging

**Validates: Requirements 8.1-8.10**
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, Optional, Tuple
import logging
from sentryfl.models.plm_backbone import PLMAnomalyDetector


logger = logging.getLogger(__name__)


class StudentModel(nn.Module):
    """
    Smaller student model architecture for edge deployment
    
    This model has a simpler architecture compared to the teacher model,
    reducing parameter count while attempting to maintain performance through
    knowledge distillation.
    """
    
    def __init__(
        self,
        input_dim: int,
        hidden_dim: int = 256,
        num_layers: int = 2,
        dropout: float = 0.1
    ):
        """
        Initialize student model with smaller architecture
        
        Args:
            input_dim: Dimension of input time-series features
            hidden_dim: Hidden dimension (smaller than teacher)
            num_layers: Number of transformer/LSTM layers
            dropout: Dropout probability
        """
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        
        # Simple LSTM-based architecture instead of large transformer
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0
        )
        
        # Anomaly detection head (similar to teacher but smaller)
        self.fc1 = nn.Linear(hidden_dim, hidden_dim // 2)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)
        self.fc2 = nn.Linear(hidden_dim // 2, 1)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass through student model
        
        Args:
            x: Input time-series tensor [batch, seq_len, input_dim]
            
        Returns:
            Anomaly scores [batch, 1]
        """
        # LSTM encoding
        # x: [batch, seq_len, input_dim]
        lstm_out, (hidden, cell) = self.lstm(x)
        
        # Use last hidden state as representation
        # hidden: [num_layers, batch, hidden_dim]
        representation = hidden[-1]  # [batch, hidden_dim]
        
        # Anomaly detection head
        out = self.fc1(representation)
        out = self.relu(out)
        out = self.dropout(out)
        scores = self.fc2(out)
        
        return scores
    
    def get_total_parameters(self) -> int:
        """Return total number of parameters"""
        return sum(p.numel() for p in self.parameters())
    
    def get_trainable_parameters(self) -> int:
        """Return number of trainable parameters"""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


class KnowledgeDistillationModule:
    """
    Knowledge distillation module for model compression
    
    Implements teacher-student training with:
    - Soft prediction distillation with temperature scaling
    - Hard label supervision
    - Combined loss optimization
    
    **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10**
    """
    
    def __init__(
        self,
        teacher_model: nn.Module,
        input_dim: int,
        student_hidden_dim: int = 256,
        student_num_layers: int = 2,
        temperature: float = 3.0,
        alpha: float = 0.7,
        device: str = 'cpu'
    ):
        """
        Initialize knowledge distillation module
        
        Args:
            teacher_model: Pre-trained federated global model (teacher)
            input_dim: Dimension of input time-series features
            student_hidden_dim: Hidden dimension for student model
            student_num_layers: Number of layers in student model
            temperature: Temperature for soft prediction smoothing (T)
            alpha: Weight for distillation loss (1-alpha for hard loss)
            device: Device for computation ('cpu' or 'cuda')
            
        **Validates: Requirements 8.1, 8.2, 8.9**
        """
        self.teacher_model = teacher_model.to(device)
        self.teacher_model.eval()  # Teacher is frozen
        
        self.input_dim = input_dim
        self.temperature = temperature
        self.alpha = alpha
        self.device = device
        
        # Initialize student model with smaller architecture
        # **Validates: Requirement 8.2**
        self.student_model = StudentModel(
            input_dim=input_dim,
            hidden_dim=student_hidden_dim,
            num_layers=student_num_layers,
            dropout=0.1
        ).to(device)
        
        # Calculate model size reduction
        teacher_params = self._get_model_parameters(teacher_model)
        student_params = self._get_model_parameters(self.student_model)
        self.size_reduction_percentage = (
            (teacher_params - student_params) / teacher_params * 100
        )
        
        logger.info(f"Initialized Knowledge Distillation Module")
        logger.info(f"Teacher parameters: {teacher_params:,}")
        logger.info(f"Student parameters: {student_params:,}")
        logger.info(f"Model size reduction: {self.size_reduction_percentage:.2f}%")
    
    def _get_model_parameters(self, model: nn.Module) -> int:
        """Get total number of parameters in a model"""
        return sum(p.numel() for p in model.parameters())
    
    def compute_soft_predictions(
        self,
        logits: torch.Tensor,
        temperature: float
    ) -> torch.Tensor:
        """
        Compute soft predictions with temperature scaling
        
        Temperature scaling smooths the probability distribution:
        - Higher T → softer (more uniform) distribution
        - Lower T → sharper (more peaked) distribution
        
        Args:
            logits: Raw model outputs [batch, 1]
            temperature: Temperature scaling parameter
            
        Returns:
            Soft predictions [batch, 1]
            
        **Validates: Requirements 8.3, 8.9**
        """
        # Apply temperature scaling
        # Soft predictions = sigmoid(logits / T)
        soft_preds = torch.sigmoid(logits / temperature)
        return soft_preds
    
    def compute_distillation_loss(
        self,
        student_logits: torch.Tensor,
        teacher_logits: torch.Tensor,
        temperature: float
    ) -> torch.Tensor:
        """
        Compute distillation loss (KL divergence between teacher and student)
        
        The distillation loss measures how well the student mimics the teacher's
        soft predictions. KL divergence is used as it's a natural measure of
        distribution similarity.
        
        Args:
            student_logits: Student model outputs [batch, 1]
            teacher_logits: Teacher model outputs [batch, 1]
            temperature: Temperature for soft prediction computation
            
        Returns:
            Distillation loss (scalar)
            
        **Validates: Requirements 8.3, 8.4, 8.5, 8.9**
        """
        # Compute soft predictions for both models with temperature scaling
        # **Validates: Requirement 8.3** (teacher soft predictions)
        teacher_soft = self.compute_soft_predictions(teacher_logits, temperature)
        
        # **Validates: Requirement 8.4** (student predictions on same inputs)
        student_soft = self.compute_soft_predictions(student_logits, temperature)
        
        # Compute KL divergence loss
        # For binary classification, we use binary cross-entropy as KL divergence
        # **Validates: Requirement 8.5** (KL divergence between teacher and student)
        distillation_loss = F.binary_cross_entropy(
            student_soft,
            teacher_soft.detach(),  # Detach to prevent gradients to teacher
            reduction='mean'
        )
        
        # Scale by T^2 as per Hinton et al. (2015)
        # This compensates for the gradient magnitude reduction from temperature scaling
        distillation_loss = distillation_loss * (temperature ** 2)
        
        return distillation_loss
    
    def compute_hard_label_loss(
        self,
        student_logits: torch.Tensor,
        labels: torch.Tensor
    ) -> torch.Tensor:
        """
        Compute hard label loss (cross-entropy with ground truth)
        
        This loss ensures the student learns from the actual labels,
        not just from the teacher's predictions.
        
        Args:
            student_logits: Student model outputs [batch, 1]
            labels: Ground truth labels [batch] or [batch, 1]
            
        Returns:
            Hard label loss (scalar)
            
        **Validates: Requirement 8.6**
        """
        # Ensure labels are correct shape
        if labels.dim() == 1:
            labels = labels.unsqueeze(1)
        
        # Compute binary cross-entropy loss with ground truth
        # **Validates: Requirement 8.6** (cross-entropy with ground truth)
        hard_loss = F.binary_cross_entropy_with_logits(
            student_logits,
            labels.float(),
            reduction='mean'
        )
        
        return hard_loss
    
    def compute_combined_loss(
        self,
        student_logits: torch.Tensor,
        teacher_logits: torch.Tensor,
        labels: torch.Tensor
    ) -> Tuple[torch.Tensor, Dict[str, float]]:
        """
        Combine distillation and hard losses with configurable weighting
        
        Combined loss = alpha * distillation_loss + (1 - alpha) * hard_label_loss
        
        Args:
            student_logits: Student model outputs [batch, 1]
            teacher_logits: Teacher model outputs [batch, 1]
            labels: Ground truth labels [batch] or [batch, 1]
            
        Returns:
            combined_loss: Weighted combination of losses
            loss_dict: Dictionary with individual loss components
            
        **Validates: Requirements 8.5, 8.6, 8.7**
        """
        # Compute distillation loss
        distillation_loss = self.compute_distillation_loss(
            student_logits,
            teacher_logits,
            self.temperature
        )
        
        # Compute hard label loss
        hard_loss = self.compute_hard_label_loss(student_logits, labels)
        
        # Combine losses with configurable weighting
        # **Validates: Requirement 8.7** (combine with configurable weight)
        combined_loss = self.alpha * distillation_loss + (1 - self.alpha) * hard_loss
        
        # Return loss components for logging
        loss_dict = {
            'combined_loss': combined_loss.item(),
            'distillation_loss': distillation_loss.item(),
            'hard_loss': hard_loss.item(),
            'alpha': self.alpha
        }
        
        return combined_loss, loss_dict
    
    def train_student(
        self,
        train_loader: torch.utils.data.DataLoader,
        optimizer: torch.optim.Optimizer,
        num_epochs: int,
        val_loader: Optional[torch.utils.data.DataLoader] = None,
        log_interval: int = 10
    ) -> Dict[str, list]:
        """
        Train student model using knowledge distillation
        
        Args:
            train_loader: Training data loader
            optimizer: Optimizer for student model
            num_epochs: Number of training epochs
            val_loader: Optional validation data loader
            log_interval: Logging interval (batches)
            
        Returns:
            Dictionary with training history (losses, metrics)
            
        **Validates: Requirement 8.8** (optimize student model)
        """
        history = {
            'train_loss': [],
            'train_distillation_loss': [],
            'train_hard_loss': [],
            'val_loss': [] if val_loader else None
        }
        
        self.student_model.train()
        
        for epoch in range(num_epochs):
            epoch_loss = 0.0
            epoch_distillation_loss = 0.0
            epoch_hard_loss = 0.0
            num_batches = 0
            
            for batch_idx, (data, labels) in enumerate(train_loader):
                # Move data to device
                data = data.to(self.device)
                labels = labels.to(self.device)
                
                # Zero gradients
                optimizer.zero_grad()
                
                # Forward pass through student
                # **Validates: Requirement 8.4** (student predictions on same inputs)
                student_logits = self.student_model(data)
                
                # Forward pass through teacher (no gradients)
                with torch.no_grad():
                    # **Validates: Requirement 8.3** (teacher soft predictions)
                    teacher_logits = self.teacher_model(data)
                
                # Compute combined loss
                # **Validates: Requirements 8.5, 8.6, 8.7**
                combined_loss, loss_dict = self.compute_combined_loss(
                    student_logits,
                    teacher_logits,
                    labels
                )
                
                # Backward pass and optimization
                # **Validates: Requirement 8.8** (optimize student model to minimize combined loss)
                combined_loss.backward()
                optimizer.step()
                
                # Accumulate losses
                epoch_loss += combined_loss.item()
                epoch_distillation_loss += loss_dict['distillation_loss']
                epoch_hard_loss += loss_dict['hard_loss']
                num_batches += 1
                
                # Log batch progress
                if batch_idx % log_interval == 0:
                    logger.info(
                        f"Epoch [{epoch+1}/{num_epochs}] "
                        f"Batch [{batch_idx}/{len(train_loader)}] "
                        f"Loss: {combined_loss.item():.4f} "
                        f"(Distill: {loss_dict['distillation_loss']:.4f}, "
                        f"Hard: {loss_dict['hard_loss']:.4f})"
                    )
            
            # Average losses for epoch
            avg_loss = epoch_loss / num_batches
            avg_distillation_loss = epoch_distillation_loss / num_batches
            avg_hard_loss = epoch_hard_loss / num_batches
            
            history['train_loss'].append(avg_loss)
            history['train_distillation_loss'].append(avg_distillation_loss)
            history['train_hard_loss'].append(avg_hard_loss)
            
            # Validation
            if val_loader is not None:
                val_loss = self.evaluate_student(val_loader)
                history['val_loss'].append(val_loss)
                logger.info(
                    f"Epoch [{epoch+1}/{num_epochs}] "
                    f"Train Loss: {avg_loss:.4f}, Val Loss: {val_loss:.4f}"
                )
            else:
                logger.info(
                    f"Epoch [{epoch+1}/{num_epochs}] "
                    f"Train Loss: {avg_loss:.4f}"
                )
        
        # **Validates: Requirement 8.10** (log model size reduction)
        logger.info(
            f"Training complete. Model size reduction: "
            f"{self.size_reduction_percentage:.2f}%"
        )
        
        return history
    
    def evaluate_student(
        self,
        data_loader: torch.utils.data.DataLoader
    ) -> float:
        """
        Evaluate student model performance
        
        Args:
            data_loader: Data loader for evaluation
            
        Returns:
            Average evaluation loss
            
        **Validates: Requirement 8.11** (evaluate student model performance)
        """
        self.student_model.eval()
        total_loss = 0.0
        num_batches = 0
        
        with torch.no_grad():
            for data, labels in data_loader:
                data = data.to(self.device)
                labels = labels.to(self.device)
                
                # Forward pass through student
                student_logits = self.student_model(data)
                
                # Forward pass through teacher
                teacher_logits = self.teacher_model(data)
                
                # Compute combined loss
                combined_loss, _ = self.compute_combined_loss(
                    student_logits,
                    teacher_logits,
                    labels
                )
                
                total_loss += combined_loss.item()
                num_batches += 1
        
        avg_loss = total_loss / num_batches
        self.student_model.train()
        
        return avg_loss
    
    def get_model_size_reduction(self) -> Dict[str, any]:
        """
        Get model size reduction statistics
        
        Returns:
            Dictionary with size reduction metrics
            
        **Validates: Requirement 8.10**
        """
        teacher_params = self._get_model_parameters(self.teacher_model)
        student_params = self._get_model_parameters(self.student_model)
        
        return {
            'teacher_parameters': teacher_params,
            'student_parameters': student_params,
            'reduction_percentage': self.size_reduction_percentage,
            'compression_ratio': teacher_params / student_params
        }
    
    def save_student_model(self, path: str):
        """
        Save student model to disk
        
        Args:
            path: Path to save the model
        """
        torch.save({
            'model_state_dict': self.student_model.state_dict(),
            'input_dim': self.input_dim,
            'hidden_dim': self.student_model.hidden_dim,
            'num_layers': self.student_model.num_layers,
            'temperature': self.temperature,
            'alpha': self.alpha,
            'size_reduction_percentage': self.size_reduction_percentage
        }, path)
        logger.info(f"Student model saved to {path}")
    
    def load_student_model(self, path: str):
        """
        Load student model from disk
        
        Args:
            path: Path to load the model from
        """
        checkpoint = torch.load(path, map_location=self.device)
        
        # Reinitialize student model with saved configuration
        self.student_model = StudentModel(
            input_dim=checkpoint['input_dim'],
            hidden_dim=checkpoint['hidden_dim'],
            num_layers=checkpoint['num_layers']
        ).to(self.device)
        
        # Load weights
        self.student_model.load_state_dict(checkpoint['model_state_dict'])
        
        # Restore configuration
        self.temperature = checkpoint['temperature']
        self.alpha = checkpoint['alpha']
        self.size_reduction_percentage = checkpoint['size_reduction_percentage']
        
        logger.info(f"Student model loaded from {path}")
