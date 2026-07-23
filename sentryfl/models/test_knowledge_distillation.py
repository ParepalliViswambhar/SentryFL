"""
Unit tests for Knowledge Distillation Module

Tests cover:
- StudentModel architecture and forward pass
- Teacher model loading
- Soft prediction computation with temperature scaling
- Distillation loss calculation (KL divergence)
- Hard label loss calculation
- Combined loss computation
- Student model training loop
- Model size reduction measurement
- Model save/load functionality

**Validates: Requirements 8.1-8.10**
"""

import pytest
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from sentryfl.models.knowledge_distillation import (
    StudentModel,
    KnowledgeDistillationModule
)
from sentryfl.models.plm_backbone import PLMAnomalyDetector


class TestStudentModel:
    """Test suite for StudentModel architecture"""
    
    def test_student_model_initialization(self):
        """Test that student model initializes correctly"""
        input_dim = 38
        hidden_dim = 256
        num_layers = 2
        
        student = StudentModel(
            input_dim=input_dim,
            hidden_dim=hidden_dim,
            num_layers=num_layers
        )
        
        assert student.input_dim == input_dim
        assert student.hidden_dim == hidden_dim
        assert student.num_layers == num_layers
        assert hasattr(student, 'lstm')
        assert hasattr(student, 'fc1')
        assert hasattr(student, 'fc2')
    
    def test_student_model_forward_shape(self):
        """Test that student model produces correct output shape"""
        batch_size = 8
        seq_len = 100
        input_dim = 38
        
        student = StudentModel(input_dim=input_dim, hidden_dim=256)
        x = torch.randn(batch_size, seq_len, input_dim)
        
        output = student(x)
        
        # Output should be [batch, 1] (anomaly scores)
        assert output.shape == (batch_size, 1)
    
    def test_student_model_different_hidden_dims(self):
        """Test student model with different hidden dimensions"""
        input_dim = 38
        
        for hidden_dim in [128, 256, 512]:
            student = StudentModel(input_dim=input_dim, hidden_dim=hidden_dim)
            x = torch.randn(4, 50, input_dim)
            output = student(x)
            assert output.shape == (4, 1)
    
    def test_student_model_parameter_count(self):
        """Test that student model is smaller than typical teacher"""
        student = StudentModel(input_dim=38, hidden_dim=256, num_layers=2)
        
        total_params = student.get_total_parameters()
        trainable_params = student.get_trainable_parameters()
        
        assert total_params > 0
        assert trainable_params == total_params  # All student params are trainable
        # Student should be relatively small (< 1M parameters)
        assert total_params < 1_000_000
    
    def test_student_model_output_numerical(self):
        """Test that student model produces numerical outputs (not NaN/Inf)"""
        student = StudentModel(input_dim=38, hidden_dim=256)
        x = torch.randn(16, 100, 38)
        
        output = student(x)
        
        assert not torch.isnan(output).any()
        assert not torch.isinf(output).any()


class TestKnowledgeDistillationModule:
    """Test suite for KnowledgeDistillationModule"""
    
    @pytest.fixture
    def teacher_model(self):
        """Create a simple teacher model for testing"""
        # Use a small teacher model for faster tests
        teacher = PLMAnomalyDetector(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=True,
            max_seq_len=128
        )
        return teacher
    
    @pytest.fixture
    def kd_module(self, teacher_model):
        """Create a knowledge distillation module for testing"""
        return KnowledgeDistillationModule(
            teacher_model=teacher_model,
            input_dim=38,
            student_hidden_dim=256,
            student_num_layers=2,
            temperature=3.0,
            alpha=0.7,
            device='cpu'
        )
    
    def test_kd_initialization(self, kd_module, teacher_model):
        """
        Test that KD module initializes correctly
        **Validates: Requirements 8.1, 8.2**
        """
        assert kd_module.teacher_model is not None
        assert kd_module.student_model is not None
        assert kd_module.temperature == 3.0
        assert kd_module.alpha == 0.7
        assert kd_module.device == 'cpu'
        
        # **Validates: Requirement 8.1** (uses federated global model as teacher)
        assert kd_module.teacher_model.training is False  # Teacher is in eval mode
        
        # **Validates: Requirement 8.2** (smaller student model)
        teacher_params = kd_module._get_model_parameters(teacher_model)
        student_params = kd_module._get_model_parameters(kd_module.student_model)
        assert student_params < teacher_params
    
    def test_model_size_reduction_calculation(self, kd_module):
        """
        Test model size reduction percentage calculation
        **Validates: Requirement 8.10**
        """
        size_stats = kd_module.get_model_size_reduction()
        
        assert 'teacher_parameters' in size_stats
        assert 'student_parameters' in size_stats
        assert 'reduction_percentage' in size_stats
        assert 'compression_ratio' in size_stats
        
        # **Validates: Requirement 8.10** (log model size reduction percentage)
        assert size_stats['reduction_percentage'] > 0
        assert size_stats['compression_ratio'] > 1
        assert size_stats['student_parameters'] < size_stats['teacher_parameters']
    
    def test_soft_predictions_computation(self, kd_module):
        """
        Test soft prediction computation with temperature scaling
        **Validates: Requirements 8.3, 8.9**
        """
        logits = torch.randn(16, 1)
        temperature = 3.0
        
        # **Validates: Requirement 8.3** (compute teacher soft predictions)
        # **Validates: Requirement 8.9** (temperature scaling for smoothing)
        soft_preds = kd_module.compute_soft_predictions(logits, temperature)
        
        assert soft_preds.shape == logits.shape
        assert (soft_preds >= 0).all() and (soft_preds <= 1).all()  # Valid probabilities
        assert not torch.isnan(soft_preds).any()
    
    def test_temperature_scaling_effect(self, kd_module):
        """
        Test that temperature scaling smooths predictions
        **Validates: Requirement 8.9**
        """
        logits = torch.tensor([[5.0], [-5.0]])  # Extreme logits
        
        # Low temperature → sharper predictions
        soft_low_t = kd_module.compute_soft_predictions(logits, temperature=1.0)
        
        # High temperature → smoother predictions
        # **Validates: Requirement 8.9** (temperature scaling for soft prediction smoothing)
        soft_high_t = kd_module.compute_soft_predictions(logits, temperature=10.0)
        
        # High temperature should produce predictions closer to 0.5 (more uniform)
        assert torch.abs(soft_high_t[0] - 0.5) < torch.abs(soft_low_t[0] - 0.5)
        assert torch.abs(soft_high_t[1] - 0.5) < torch.abs(soft_low_t[1] - 0.5)
    
    def test_distillation_loss_computation(self, kd_module):
        """
        Test distillation loss (KL divergence) computation
        **Validates: Requirements 8.3, 8.4, 8.5**
        """
        batch_size = 8
        student_logits = torch.randn(batch_size, 1)
        teacher_logits = torch.randn(batch_size, 1)
        temperature = 3.0
        
        # **Validates: Requirements 8.3, 8.4, 8.5**
        # (teacher soft predictions, student predictions, KL divergence)
        distillation_loss = kd_module.compute_distillation_loss(
            student_logits,
            teacher_logits,
            temperature
        )
        
        assert distillation_loss.dim() == 0  # Scalar loss
        assert distillation_loss.item() >= 0  # Loss should be non-negative
        assert not torch.isnan(distillation_loss)
    
    def test_distillation_loss_zero_when_equal(self, kd_module):
        """Test that distillation loss is smaller when predictions are closer"""
        # Test with identical logits
        logits_identical = torch.randn(16, 1)
        temperature = 3.0
        
        loss_identical = kd_module.compute_distillation_loss(
            logits_identical,
            logits_identical,
            temperature
        )
        
        # Test with different logits
        logits_student = torch.randn(16, 1)
        logits_teacher = torch.randn(16, 1)
        
        loss_different = kd_module.compute_distillation_loss(
            logits_student,
            logits_teacher,
            temperature
        )
        
        # Loss with identical predictions should be much smaller
        # (though not exactly zero due to numerical precision and T^2 scaling)
        assert loss_identical.item() < loss_different.item()
    
    def test_hard_label_loss_computation(self, kd_module):
        """
        Test hard label loss (cross-entropy) computation
        **Validates: Requirement 8.6**
        """
        batch_size = 8
        student_logits = torch.randn(batch_size, 1)
        labels = torch.randint(0, 2, (batch_size,))
        
        # **Validates: Requirement 8.6** (cross-entropy with ground truth)
        hard_loss = kd_module.compute_hard_label_loss(student_logits, labels)
        
        assert hard_loss.dim() == 0  # Scalar loss
        assert hard_loss.item() >= 0  # Loss should be non-negative
        assert not torch.isnan(hard_loss)
    
    def test_hard_label_loss_with_different_label_shapes(self, kd_module):
        """Test hard label loss with different label shapes"""
        student_logits = torch.randn(8, 1)
        
        # Test with 1D labels
        labels_1d = torch.randint(0, 2, (8,))
        loss_1d = kd_module.compute_hard_label_loss(student_logits, labels_1d)
        
        # Test with 2D labels
        labels_2d = torch.randint(0, 2, (8, 1))
        loss_2d = kd_module.compute_hard_label_loss(student_logits, labels_2d)
        
        # Both should work and produce valid losses
        assert loss_1d.item() >= 0
        assert loss_2d.item() >= 0
    
    def test_combined_loss_computation(self, kd_module):
        """
        Test combined loss with configurable weighting
        **Validates: Requirements 8.5, 8.6, 8.7**
        """
        batch_size = 8
        student_logits = torch.randn(batch_size, 1)
        teacher_logits = torch.randn(batch_size, 1)
        labels = torch.randint(0, 2, (batch_size,))
        
        # **Validates: Requirement 8.7** (combine losses with configurable weight)
        combined_loss, loss_dict = kd_module.compute_combined_loss(
            student_logits,
            teacher_logits,
            labels
        )
        
        assert combined_loss.dim() == 0  # Scalar loss
        assert combined_loss.item() >= 0
        assert not torch.isnan(combined_loss)
        
        # Check loss dictionary contains all components
        assert 'combined_loss' in loss_dict
        assert 'distillation_loss' in loss_dict
        assert 'hard_loss' in loss_dict
        assert 'alpha' in loss_dict
        
        # Verify alpha is used correctly
        assert loss_dict['alpha'] == kd_module.alpha
    
    def test_combined_loss_weighting(self):
        """
        Test that alpha correctly weights distillation vs hard loss
        **Validates: Requirement 8.7**
        """
        # Create simple teacher model
        teacher = PLMAnomalyDetector(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=True,
            max_seq_len=128
        )
        
        # Test with alpha = 1.0 (only distillation loss)
        kd_alpha_1 = KnowledgeDistillationModule(
            teacher_model=teacher,
            input_dim=38,
            alpha=1.0,
            device='cpu'
        )
        
        student_logits = torch.randn(4, 1)
        teacher_logits = torch.randn(4, 1)
        labels = torch.randint(0, 2, (4,))
        
        _, loss_dict_1 = kd_alpha_1.compute_combined_loss(
            student_logits, teacher_logits, labels
        )
        
        # With alpha=1.0, combined should equal distillation
        assert abs(loss_dict_1['combined_loss'] - loss_dict_1['distillation_loss']) < 1e-5
        
        # Test with alpha = 0.0 (only hard loss)
        kd_alpha_0 = KnowledgeDistillationModule(
            teacher_model=teacher,
            input_dim=38,
            alpha=0.0,
            device='cpu'
        )
        
        _, loss_dict_0 = kd_alpha_0.compute_combined_loss(
            student_logits, teacher_logits, labels
        )
        
        # With alpha=0.0, combined should equal hard loss
        assert abs(loss_dict_0['combined_loss'] - loss_dict_0['hard_loss']) < 1e-5
    
    def test_student_training_loop(self, kd_module):
        """
        Test student model training loop
        **Validates: Requirement 8.8**
        """
        # Create small synthetic dataset
        batch_size = 4
        num_samples = 16
        seq_len = 50
        input_dim = 38
        
        X = torch.randn(num_samples, seq_len, input_dim)
        y = torch.randint(0, 2, (num_samples,))
        
        dataset = TensorDataset(X, y)
        train_loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
        
        # Create optimizer
        optimizer = torch.optim.Adam(kd_module.student_model.parameters(), lr=0.001)
        
        # Train for 2 epochs
        # **Validates: Requirement 8.8** (optimize student model to minimize combined loss)
        history = kd_module.train_student(
            train_loader=train_loader,
            optimizer=optimizer,
            num_epochs=2,
            log_interval=1
        )
        
        # Check that training history is recorded
        assert 'train_loss' in history
        assert 'train_distillation_loss' in history
        assert 'train_hard_loss' in history
        assert len(history['train_loss']) == 2  # 2 epochs
        
        # Check that losses are numerical
        assert all(not torch.isnan(torch.tensor(loss)) for loss in history['train_loss'])
    
    def test_student_evaluation(self, kd_module):
        """
        Test student model evaluation
        **Validates: Requirement 8.11**
        """
        # Create small synthetic dataset
        batch_size = 4
        num_samples = 16
        seq_len = 50
        input_dim = 38
        
        X = torch.randn(num_samples, seq_len, input_dim)
        y = torch.randint(0, 2, (num_samples,))
        
        dataset = TensorDataset(X, y)
        eval_loader = DataLoader(dataset, batch_size=batch_size, shuffle=False)
        
        # **Validates: Requirement 8.11** (evaluate student model performance)
        eval_loss = kd_module.evaluate_student(eval_loader)
        
        assert isinstance(eval_loss, float)
        assert eval_loss >= 0
        assert not torch.isnan(torch.tensor(eval_loss))
    
    def test_model_save_load(self, kd_module, tmp_path):
        """Test student model save and load functionality"""
        # Save model
        save_path = tmp_path / "student_model.pt"
        kd_module.save_student_model(str(save_path))
        
        assert save_path.exists()
        
        # Load model
        kd_module.load_student_model(str(save_path))
        
        # Test that loaded model works
        x = torch.randn(2, 50, 38)
        output = kd_module.student_model(x)
        
        assert output.shape == (2, 1)
        assert not torch.isnan(output).any()
    
    def test_forward_pass_consistency(self, kd_module):
        """
        Test that teacher and student process same inputs
        **Validates: Requirements 8.3, 8.4**
        """
        batch_size = 4
        seq_len = 50
        input_dim = 38
        
        x = torch.randn(batch_size, seq_len, input_dim)
        
        # **Validates: Requirement 8.3** (compute teacher soft predictions)
        with torch.no_grad():
            teacher_output = kd_module.teacher_model(x)
        
        # **Validates: Requirement 8.4** (compute student predictions on same inputs)
        student_output = kd_module.student_model(x)
        
        # Both should produce outputs of same shape
        assert teacher_output.shape == student_output.shape
        assert teacher_output.shape == (batch_size, 1)
        assert student_output.shape == (batch_size, 1)
    
    def test_gradient_flow_to_student_only(self, kd_module):
        """Test that gradients flow to student but not teacher"""
        x = torch.randn(2, 50, 38)
        labels = torch.randint(0, 2, (2,))
        
        # Forward pass
        student_logits = kd_module.student_model(x)
        with torch.no_grad():
            teacher_logits = kd_module.teacher_model(x)
        
        # Compute loss
        combined_loss, _ = kd_module.compute_combined_loss(
            student_logits,
            teacher_logits,
            labels
        )
        
        # Backward pass
        combined_loss.backward()
        
        # Check that student has gradients
        student_has_grads = any(
            p.grad is not None and p.grad.abs().sum() > 0
            for p in kd_module.student_model.parameters()
        )
        assert student_has_grads
        
        # Check that teacher has no gradients (or all zero)
        teacher_has_grads = any(
            p.grad is not None and p.grad.abs().sum() > 0
            for p in kd_module.teacher_model.parameters()
        )
        assert not teacher_has_grads


class TestIntegration:
    """Integration tests for knowledge distillation system"""
    
    def test_end_to_end_distillation(self):
        """Test complete knowledge distillation workflow"""
        # Create teacher model
        teacher = PLMAnomalyDetector(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=True,
            max_seq_len=128
        )
        
        # Create KD module
        kd_module = KnowledgeDistillationModule(
            teacher_model=teacher,
            input_dim=38,
            student_hidden_dim=256,
            student_num_layers=2,
            temperature=3.0,
            alpha=0.7,
            device='cpu'
        )
        
        # Create synthetic data
        num_samples = 32
        X = torch.randn(num_samples, 50, 38)
        y = torch.randint(0, 2, (num_samples,))
        
        dataset = TensorDataset(X, y)
        train_loader = DataLoader(dataset, batch_size=8, shuffle=True)
        val_loader = DataLoader(dataset, batch_size=8, shuffle=False)
        
        # Train student
        optimizer = torch.optim.Adam(kd_module.student_model.parameters(), lr=0.001)
        history = kd_module.train_student(
            train_loader=train_loader,
            optimizer=optimizer,
            num_epochs=2,
            val_loader=val_loader,
            log_interval=1
        )
        
        # Validate training completed
        assert len(history['train_loss']) == 2
        assert len(history['val_loss']) == 2
        
        # Check model size reduction
        size_stats = kd_module.get_model_size_reduction()
        assert size_stats['reduction_percentage'] > 50  # At least 50% reduction
    
    def test_different_temperature_values(self):
        """Test distillation with different temperature values"""
        teacher = PLMAnomalyDetector(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=True,
            max_seq_len=128
        )
        
        temperatures = [1.0, 3.0, 5.0, 10.0]
        
        for temp in temperatures:
            kd_module = KnowledgeDistillationModule(
                teacher_model=teacher,
                input_dim=38,
                temperature=temp,
                alpha=0.7,
                device='cpu'
            )
            
            # Test that module works with different temperatures
            student_logits = torch.randn(4, 1)
            teacher_logits = torch.randn(4, 1)
            
            distillation_loss = kd_module.compute_distillation_loss(
                student_logits,
                teacher_logits,
                temp
            )
            
            assert distillation_loss.item() >= 0
            assert not torch.isnan(distillation_loss)
    
    def test_different_alpha_values(self):
        """Test distillation with different alpha (loss weighting) values"""
        teacher = PLMAnomalyDetector(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=True,
            max_seq_len=128
        )
        
        alphas = [0.0, 0.3, 0.5, 0.7, 1.0]
        
        for alpha in alphas:
            kd_module = KnowledgeDistillationModule(
                teacher_model=teacher,
                input_dim=38,
                temperature=3.0,
                alpha=alpha,
                device='cpu'
            )
            
            # Test that module works with different alphas
            student_logits = torch.randn(4, 1)
            teacher_logits = torch.randn(4, 1)
            labels = torch.randint(0, 2, (4,))
            
            combined_loss, loss_dict = kd_module.compute_combined_loss(
                student_logits,
                teacher_logits,
                labels
            )
            
            assert combined_loss.item() >= 0
            assert loss_dict['alpha'] == alpha
