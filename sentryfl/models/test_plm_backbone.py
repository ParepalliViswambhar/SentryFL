"""
Unit tests for PLM backbone components

Tests cover:
- PositionalEncoding functionality
- PLMTimeSeriesBackbone forward pass
- AnomalyDetectionHead forward pass
- Output shape validation
- Parameter freezing verification
- Complete model integration
"""

import pytest
import torch
import torch.nn as nn
from sentryfl.models.plm_backbone import (
    PositionalEncoding,
    PLMTimeSeriesBackbone,
    AnomalyDetectionHead,
    PLMAnomalyDetector
)


class TestPositionalEncoding:
    """Test suite for PositionalEncoding module"""
    
    def test_positional_encoding_initialization(self):
        """Test that positional encoding initializes correctly"""
        d_model = 768
        max_len = 512
        pe = PositionalEncoding(d_model=d_model, max_len=max_len)
        
        # Check that pe buffer exists
        assert hasattr(pe, 'pe')
        assert pe.pe.shape == (max_len, d_model)
    
    def test_positional_encoding_forward_shape(self):
        """Test that positional encoding preserves input shape"""
        batch_size = 4
        seq_len = 100
        d_model = 768
        
        pe = PositionalEncoding(d_model=d_model, max_len=512)
        x = torch.randn(batch_size, seq_len, d_model)
        
        output = pe(x)
        
        assert output.shape == x.shape
        assert output.shape == (batch_size, seq_len, d_model)
    
    def test_positional_encoding_deterministic(self):
        """Test that positional encoding is deterministic (same input -> same output)"""
        pe = PositionalEncoding(d_model=768, max_len=512, dropout=0.0)
        x = torch.randn(2, 50, 768)
        
        output1 = pe(x)
        output2 = pe(x)
        
        # With dropout=0, outputs should be identical
        assert torch.allclose(output1, output2)
    
    def test_positional_encoding_different_seq_lengths(self):
        """Test positional encoding with various sequence lengths"""
        pe = PositionalEncoding(d_model=256, max_len=512)
        
        for seq_len in [10, 50, 100, 200, 500]:
            x = torch.randn(2, seq_len, 256)
            output = pe(x)
            assert output.shape == (2, seq_len, 256)


class TestPLMTimeSeriesBackbone:
    """Test suite for PLMTimeSeriesBackbone module"""
    
    @pytest.fixture
    def small_backbone(self):
        """Create a small backbone for testing (use distilbert for faster tests)"""
        return PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=True,
            max_seq_len=128
        )
    
    def test_backbone_initialization(self, small_backbone):
        """Test that backbone initializes correctly"""
        assert small_backbone.input_dim == 38
        assert small_backbone.hidden_dim == 768  # distilbert hidden size
        assert hasattr(small_backbone, 'transformer')
        assert hasattr(small_backbone, 'ts_projection')
        assert hasattr(small_backbone, 'positional_encoding')
    
    def test_backbone_forward_shape(self, small_backbone):
        """Test that backbone produces correct output shape"""
        batch_size = 4
        seq_len = 100
        input_dim = 38
        
        x = torch.randn(batch_size, seq_len, input_dim)
        output = small_backbone(x)
        
        # Output should be [batch, hidden_dim]
        assert output.shape == (batch_size, small_backbone.hidden_dim)
        assert output.shape == (batch_size, 768)
    
    def test_backbone_parameter_freezing(self):
        """Test that backbone parameters are frozen when requested"""
        backbone_frozen = PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=True
        )
        
        # Check that transformer parameters are frozen
        for param in backbone_frozen.transformer.parameters():
            assert not param.requires_grad
        
        # Check that projection layer is trainable
        for param in backbone_frozen.ts_projection.parameters():
            assert param.requires_grad
    
    def test_backbone_without_freezing(self):
        """Test that backbone parameters are trainable when not frozen"""
        backbone_trainable = PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=False
        )
        
        # Check that transformer parameters are trainable
        transformer_params_trainable = any(
            param.requires_grad for param in backbone_trainable.transformer.parameters()
        )
        assert transformer_params_trainable
    
    def test_backbone_different_input_dims(self):
        """Test backbone with different input dimensions"""
        for input_dim in [10, 38, 50, 100]:
            backbone = PLMTimeSeriesBackbone(
                input_dim=input_dim,
                model_name='distilbert-base-uncased',
                freeze_backbone=True
            )
            
            x = torch.randn(2, 50, input_dim)
            output = backbone(x)
            assert output.shape == (2, 768)
    
    def test_backbone_trainable_parameters(self, small_backbone):
        """Test trainable parameter counting"""
        trainable_params = small_backbone.get_trainable_parameters()
        total_params = small_backbone.get_total_parameters()
        
        # With frozen backbone, trainable should be much less than total
        assert trainable_params > 0
        assert trainable_params < total_params
        assert trainable_params / total_params < 0.1  # Less than 10% trainable


class TestAnomalyDetectionHead:
    """Test suite for AnomalyDetectionHead module"""
    
    def test_head_initialization(self):
        """Test that detection head initializes correctly"""
        hidden_dim = 768
        head = AnomalyDetectionHead(hidden_dim=hidden_dim)
        
        assert hasattr(head, 'fc1')
        assert hasattr(head, 'fc2')
        assert hasattr(head, 'relu')
        assert hasattr(head, 'dropout')
    
    def test_head_forward_shape(self):
        """Test that detection head produces correct output shape"""
        hidden_dim = 768
        batch_size = 8
        
        head = AnomalyDetectionHead(hidden_dim=hidden_dim)
        x = torch.randn(batch_size, hidden_dim)
        
        output = head(x)
        
        # Output should be [batch, 1] (single anomaly score per sample)
        assert output.shape == (batch_size, 1)
    
    def test_head_different_hidden_dims(self):
        """Test detection head with different hidden dimensions"""
        for hidden_dim in [256, 512, 768, 1024]:
            head = AnomalyDetectionHead(hidden_dim=hidden_dim)
            x = torch.randn(4, hidden_dim)
            output = head(x)
            assert output.shape == (4, 1)
    
    def test_head_output_range(self):
        """Test that detection head produces numerical outputs (not NaN/Inf)"""
        head = AnomalyDetectionHead(hidden_dim=768)
        x = torch.randn(16, 768)
        
        output = head(x)
        
        assert not torch.isnan(output).any()
        assert not torch.isinf(output).any()


class TestPLMAnomalyDetector:
    """Test suite for complete PLMAnomalyDetector model"""
    
    @pytest.fixture
    def small_model(self):
        """Create a small model for testing"""
        return PLMAnomalyDetector(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=True,
            max_seq_len=128
        )
    
    def test_model_initialization(self, small_model):
        """Test that complete model initializes correctly"""
        assert hasattr(small_model, 'backbone')
        assert hasattr(small_model, 'head')
        assert isinstance(small_model.backbone, PLMTimeSeriesBackbone)
        assert isinstance(small_model.head, AnomalyDetectionHead)
    
    def test_model_forward_shape(self, small_model):
        """Test that complete model produces correct output shape"""
        batch_size = 8
        seq_len = 100
        input_dim = 38
        
        x = torch.randn(batch_size, seq_len, input_dim)
        output = small_model(x)
        
        # Output should be [batch, 1] (anomaly scores)
        assert output.shape == (batch_size, 1)
    
    def test_model_end_to_end(self, small_model):
        """Test complete forward pass from time-series to anomaly scores"""
        x = torch.randn(4, 50, 38)
        
        # Forward pass
        scores = small_model(x)
        
        # Check output properties
        assert scores.shape == (4, 1)
        assert not torch.isnan(scores).any()
        assert not torch.isinf(scores).any()
    
    def test_model_gradient_flow(self, small_model):
        """Test that gradients flow correctly through trainable parameters"""
        x = torch.randn(2, 50, 38)
        target = torch.randn(2, 1)
        
        # Forward pass
        output = small_model(x)
        
        # Compute loss and backward
        loss = nn.MSELoss()(output, target)
        loss.backward()
        
        # Check that trainable parameters have gradients
        for name, param in small_model.named_parameters():
            if param.requires_grad:
                assert param.grad is not None, f"Parameter {name} has no gradient"
    
    def test_model_parameter_counting(self, small_model):
        """Test parameter counting methods"""
        trainable = small_model.get_trainable_parameters()
        total = small_model.get_total_parameters()
        
        assert trainable > 0
        assert total > trainable
        assert trainable < total * 0.2  # Less than 20% trainable with frozen backbone
    
    def test_model_different_batch_sizes(self, small_model):
        """Test model with different batch sizes"""
        seq_len = 50
        input_dim = 38
        
        for batch_size in [1, 2, 4, 8, 16]:
            x = torch.randn(batch_size, seq_len, input_dim)
            output = small_model(x)
            assert output.shape == (batch_size, 1)
    
    def test_model_different_sequence_lengths(self, small_model):
        """Test model with different sequence lengths"""
        batch_size = 4
        input_dim = 38
        
        for seq_len in [10, 50, 100, 128]:
            x = torch.randn(batch_size, seq_len, input_dim)
            output = small_model(x)
            assert output.shape == (batch_size, 1)
    
    def test_model_training_mode(self, small_model):
        """Test model in training vs evaluation mode"""
        x = torch.randn(4, 50, 38)
        
        # Training mode
        small_model.train()
        output_train = small_model(x)
        
        # Evaluation mode
        small_model.eval()
        with torch.no_grad():
            output_eval = small_model(x)
        
        # Outputs might differ slightly due to dropout
        assert output_train.shape == output_eval.shape
        assert not torch.isnan(output_train).any()
        assert not torch.isnan(output_eval).any()


class TestIntegration:
    """Integration tests for complete PLM backbone system"""
    
    def test_cls_token_extraction(self):
        """Test that BERT models correctly extract [CLS] token"""
        backbone = PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=True
        )
        
        x = torch.randn(2, 50, 38)
        representation = backbone(x)
        
        # Should extract single representation per sample
        assert representation.shape == (2, backbone.hidden_dim)
    
    def test_custom_hidden_dim(self):
        """Test that custom hidden dimension is respected"""
        custom_dim = 512
        backbone = PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='distilbert-base-uncased',
            hidden_dim=custom_dim,
            freeze_backbone=True
        )
        
        # Note: This test expects the projection layer to use custom_dim
        # but transformer still uses its native hidden_dim
        # The projection maps input_dim -> custom_dim
        assert backbone.hidden_dim == custom_dim
    
    def test_model_save_load(self, tmp_path):
        """Test that model can be saved and loaded"""
        model = PLMAnomalyDetector(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=True
        )
        
        # Save model
        save_path = tmp_path / "model.pt"
        torch.save(model.state_dict(), save_path)
        
        # Load model
        loaded_model = PLMAnomalyDetector(
            input_dim=38,
            model_name='distilbert-base-uncased',
            freeze_backbone=True
        )
        loaded_model.load_state_dict(torch.load(save_path))
        
        # Test that loaded model produces same output
        x = torch.randn(2, 50, 38)
        model.eval()
        loaded_model.eval()
        
        with torch.no_grad():
            output1 = model(x)
            output2 = loaded_model(x)
        
        assert torch.allclose(output1, output2, atol=1e-6)
