"""
PLM Backbone Module: Pre-trained Language Model for time-series representation learning

This module implements transformer-based backbone for time-series anomaly detection,
converting time-series windows into contextualized representations.
"""

import math
import torch
import torch.nn as nn
from typing import Optional
from transformers import AutoModel, AutoConfig


class PositionalEncoding(nn.Module):
    """Sinusoidal positional encoding for temporal sequences"""
    
    def __init__(self, d_model: int, max_len: int = 512, dropout: float = 0.1):
        """
        Initialize positional encoding module
        
        Args:
            d_model: Dimension of the model (hidden dimension)
            max_len: Maximum sequence length
            dropout: Dropout probability
        """
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)
        
        # Create positional encoding matrix
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        
        # Register as buffer (not a parameter, but part of module state)
        self.register_buffer('pe', pe)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Add positional encoding to input
        
        Args:
            x: Input tensor [batch, seq_len, d_model]
            
        Returns:
            Output tensor with positional encoding [batch, seq_len, d_model]
        """
        # x: [batch, seq_len, d_model]
        # pe: [max_len, d_model]
        # Add positional encoding to input
        x = x + self.pe[:x.size(1), :].unsqueeze(0)
        return self.dropout(x)


class PLMTimeSeriesBackbone(nn.Module):
    """Transformer-based backbone for time-series encoding"""
    
    def __init__(
        self, 
        input_dim: int,
        model_name: str = 'bert-base-uncased',
        hidden_dim: Optional[int] = None,
        freeze_backbone: bool = True,
        max_seq_len: int = 512,
        dropout: float = 0.1
    ):
        """
        Initialize PLM backbone for time-series
        
        Args:
            input_dim: Dimension of input time-series features
            model_name: Pre-trained model name from Hugging Face
            hidden_dim: Hidden dimension (defaults to model's hidden size)
            freeze_backbone: Whether to freeze transformer parameters
            max_seq_len: Maximum sequence length for positional encoding
            dropout: Dropout probability
        """
        super().__init__()
        self.model_name = model_name
        self.input_dim = input_dim
        self.freeze_backbone = freeze_backbone
        
        # Load pre-trained transformer model
        self.config = AutoConfig.from_pretrained(model_name)
        self.transformer = AutoModel.from_pretrained(model_name)
        
        # Set hidden dimension from transformer config if not specified
        if hidden_dim is None:
            hidden_dim = self.config.hidden_size
        self.hidden_dim = hidden_dim
        
        # Freeze transformer parameters if specified
        if freeze_backbone:
            for param in self.transformer.parameters():
                param.requires_grad = False
        
        # Time-series projection layer (maps input features to transformer hidden dim)
        self.ts_projection = nn.Linear(input_dim, hidden_dim)
        
        # Positional encoding for temporal order
        self.positional_encoding = PositionalEncoding(
            d_model=hidden_dim,
            max_len=max_seq_len,
            dropout=dropout
        )
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass through PLM backbone
        
        Args:
            x: Input time-series tensor [batch, seq_len, input_dim]
            
        Returns:
            Contextualized representation [batch, hidden_dim]
        """
        # Project time-series features to hidden dimension
        # x: [batch, seq_len, input_dim] -> [batch, seq_len, hidden_dim]
        x = self.ts_projection(x)
        
        # Add positional encoding
        # x: [batch, seq_len, hidden_dim]
        x = self.positional_encoding(x)
        
        # Pass through transformer
        # For BERT-style models, use inputs_embeds parameter
        outputs = self.transformer(inputs_embeds=x)
        
        # Extract [CLS] token representation for BERT-like models
        # or use mean pooling for other models
        if 'bert' in self.model_name.lower():
            # Use [CLS] token (first token)
            representation = outputs.last_hidden_state[:, 0, :]
        else:
            # Use mean pooling over sequence
            representation = outputs.last_hidden_state.mean(dim=1)
        
        return representation
    
    def get_trainable_parameters(self):
        """Return number of trainable parameters"""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
    
    def get_total_parameters(self):
        """Return total number of parameters"""
        return sum(p.numel() for p in self.parameters())


class AnomalyDetectionHead(nn.Module):
    """Two-layer MLP head for anomaly scoring"""
    
    def __init__(self, hidden_dim: int, dropout: float = 0.1):
        """
        Initialize anomaly detection head
        
        Args:
            hidden_dim: Input dimension from backbone
            dropout: Dropout probability
        """
        super().__init__()
        
        # Two-layer MLP with ReLU activation
        self.fc1 = nn.Linear(hidden_dim, hidden_dim // 2)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)
        self.fc2 = nn.Linear(hidden_dim // 2, 1)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Compute anomaly scores
        
        Args:
            x: Input representations [batch, hidden_dim]
            
        Returns:
            Anomaly scores [batch, 1] - higher score indicates more anomalous
        """
        x = self.fc1(x)
        x = self.relu(x)
        x = self.dropout(x)
        scores = self.fc2(x)
        return scores


class PLMAnomalyDetector(nn.Module):
    """Complete anomaly detection model combining PLM backbone and detection head"""
    
    def __init__(
        self,
        input_dim: int,
        model_name: str = 'bert-base-uncased',
        hidden_dim: Optional[int] = None,
        freeze_backbone: bool = True,
        max_seq_len: int = 512,
        dropout: float = 0.1
    ):
        """
        Initialize complete anomaly detection model
        
        Args:
            input_dim: Dimension of input time-series features
            model_name: Pre-trained model name from Hugging Face
            hidden_dim: Hidden dimension (defaults to model's hidden size)
            freeze_backbone: Whether to freeze transformer parameters
            max_seq_len: Maximum sequence length
            dropout: Dropout probability
        """
        super().__init__()
        
        # Initialize backbone
        self.backbone = PLMTimeSeriesBackbone(
            input_dim=input_dim,
            model_name=model_name,
            hidden_dim=hidden_dim,
            freeze_backbone=freeze_backbone,
            max_seq_len=max_seq_len,
            dropout=dropout
        )
        
        # Initialize detection head
        self.head = AnomalyDetectionHead(
            hidden_dim=self.backbone.hidden_dim,
            dropout=dropout
        )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass through complete model
        
        Args:
            x: Input time-series [batch, seq_len, input_dim]
            
        Returns:
            Anomaly scores [batch, 1]
        """
        # Get representation from backbone
        representation = self.backbone(x)
        
        # Compute anomaly scores
        scores = self.head(representation)
        
        return scores
    
    def get_trainable_parameters(self):
        """Return number of trainable parameters"""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
    
    def get_total_parameters(self):
        """Return total number of parameters"""
        return sum(p.numel() for p in self.parameters())
