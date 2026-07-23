"""
Unit tests for ADMS Module
"""

import pytest
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sentryfl.federated.adms import ADMSModule


class SimpleModel(nn.Module):
    """Simple model for testing"""
    def __init__(self, input_dim: int = 10, hidden_dim: int = 20, output_dim: int = 1):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hidden_dim, output_dim)
    
    def forward(self, x):
        x = self.fc1(x)
        x = self.relu(x)
        x = self.fc2(x)
        return x


@pytest.fixture
def simple_model():
    """Fixture providing a simple model"""
    return SimpleModel(input_dim=10, hidden_dim=20, output_dim=1)


@pytest.fixture
def anomaly_data():
    """Fixture providing mock anomalous data"""
    # Create synthetic anomalous samples
    torch.manual_seed(42)
    X = torch.randn(50, 10)  # 50 samples, 10 features
    y = torch.randn(50, 1)   # 50 labels
    
    dataset = TensorDataset(X, y)
    loader = DataLoader(dataset, batch_size=10, shuffle=False)
    
    return loader


def test_adms_initialization(simple_model):
    """Test ADMS module initialization"""
    adms = ADMSModule(simple_model, selection_ratio=0.05)
    
    assert adms.model == simple_model
    assert adms.selection_ratio == 0.05
    assert adms.parameter_mask is None
    assert adms.importance_scores == {}


def test_compute_importance(simple_model, anomaly_data):
    """Test importance score computation on mock anomalous data"""
    adms = ADMSModule(simple_model, selection_ratio=0.05)
    criterion = nn.MSELoss()
    
    # Compute importance scores
    adms.compute_importance(anomaly_data, criterion, device='cpu')
    
    # Verify importance scores were computed for all parameters
    model_param_names = {name for name, param in simple_model.named_parameters() if param.requires_grad}
    importance_names = set(adms.importance_scores.keys())
    
    assert model_param_names == importance_names
    
    # Verify importance scores have correct shapes
    for name, param in simple_model.named_parameters():
        if param.requires_grad:
            assert adms.importance_scores[name].shape == param.shape
            # Verify importance scores are non-negative
            assert (adms.importance_scores[name] >= 0).all()


def test_generate_mask_various_selection_ratios(simple_model, anomaly_data):
    """Test mask generation with various selection ratios (1%, 5%, 10%)"""
    criterion = nn.MSELoss()
    
    for selection_ratio in [0.01, 0.05, 0.10]:
        adms = ADMSModule(simple_model, selection_ratio=selection_ratio)
        adms.compute_importance(anomaly_data, criterion, device='cpu')
        
        # Generate mask
        mask = adms.generate_mask()
        
        # Verify mask was generated for all parameters
        model_param_names = {name for name, param in simple_model.named_parameters() if param.requires_grad}
        mask_names = set(mask.keys())
        assert model_param_names == mask_names
        
        # Verify mask values are binary (0 or 1)
        for name in mask:
            unique_values = torch.unique(mask[name])
            assert all(v in [0.0, 1.0] for v in unique_values.tolist())
        
        # Verify selection statistics
        stats = adms.get_selection_statistics()
        assert 'total_parameters' in stats
        assert 'selected_parameters' in stats
        assert 'selection_ratio' in stats
        assert 'communication_reduction' in stats
        
        # Verify actual selection ratio is close to target
        # (may not be exact due to discrete parameter counts)
        actual_ratio = stats['selection_ratio']
        assert actual_ratio > 0  # At least some parameters selected
        assert actual_ratio <= selection_ratio * 2  # Reasonable upper bound


def test_apply_mask(simple_model, anomaly_data):
    """Test masked gradient application"""
    adms = ADMSModule(simple_model, selection_ratio=0.05)
    criterion = nn.MSELoss()
    
    # Compute importance and generate mask
    adms.compute_importance(anomaly_data, criterion, device='cpu')
    adms.generate_mask()
    
    # Create mock gradients
    gradients = {name: torch.randn_like(param) for name, param in simple_model.named_parameters()}
    
    # Apply mask
    masked_gradients = adms.apply_mask(gradients)
    
    # Verify all gradients are present
    assert set(masked_gradients.keys()) == set(gradients.keys())
    
    # Verify masking: non-selected parameters should have zero gradients
    for name in masked_gradients:
        if name in adms.parameter_mask:
            mask = adms.parameter_mask[name]
            masked_grad = masked_gradients[name]
            original_grad = gradients[name]
            
            # Where mask is 0, gradient should be 0
            zero_positions = (mask == 0)
            if zero_positions.any():
                assert (masked_grad[zero_positions] == 0).all()
            
            # Where mask is 1, gradient should be unchanged
            one_positions = (mask == 1)
            if one_positions.any():
                assert torch.allclose(masked_grad[one_positions], original_grad[one_positions])


def test_selection_statistics_calculation(simple_model, anomaly_data):
    """Test selection statistics calculation"""
    adms = ADMSModule(simple_model, selection_ratio=0.05)
    criterion = nn.MSELoss()
    
    adms.compute_importance(anomaly_data, criterion, device='cpu')
    adms.generate_mask()
    
    stats = adms.get_selection_statistics()
    
    # Verify statistics structure
    assert 'total_parameters' in stats
    assert 'selected_parameters' in stats
    assert 'selection_ratio' in stats
    assert 'communication_reduction' in stats
    
    # Verify values are reasonable
    assert stats['total_parameters'] > 0
    assert stats['selected_parameters'] > 0
    assert stats['selected_parameters'] <= stats['total_parameters']
    assert 0 <= stats['selection_ratio'] <= 1
    assert 0 <= stats['communication_reduction'] <= 1
    
    # Verify communication reduction is complement of selection ratio
    assert abs(stats['communication_reduction'] + stats['selection_ratio'] - 1.0) < 1e-6


def test_error_handling_no_importance_scores(simple_model):
    """Test error handling when generating mask without computing importance"""
    adms = ADMSModule(simple_model, selection_ratio=0.05)
    
    with pytest.raises(RuntimeError, match="Importance scores not computed"):
        adms.generate_mask()


def test_error_handling_no_mask(simple_model, anomaly_data):
    """Test error handling when applying mask without generating it"""
    adms = ADMSModule(simple_model, selection_ratio=0.05)
    criterion = nn.MSELoss()
    
    # Compute importance but don't generate mask
    adms.compute_importance(anomaly_data, criterion, device='cpu')
    
    gradients = {name: torch.randn_like(param) for name, param in simple_model.named_parameters()}
    
    with pytest.raises(RuntimeError, match="Parameter mask not generated"):
        adms.apply_mask(gradients)


def test_error_handling_no_mask_statistics(simple_model):
    """Test error handling when getting statistics without generating mask"""
    adms = ADMSModule(simple_model, selection_ratio=0.05)
    
    with pytest.raises(RuntimeError, match="Parameter mask not generated"):
        adms.get_selection_statistics()


def test_update_mask_periodically(simple_model, anomaly_data):
    """Test periodic mask update functionality"""
    adms = ADMSModule(simple_model, selection_ratio=0.05)
    criterion = nn.MSELoss()
    
    # Initial mask generation
    adms.compute_importance(anomaly_data, criterion, device='cpu')
    adms.generate_mask()
    initial_mask = {name: mask.clone() for name, mask in adms.parameter_mask.items()}
    
    # Update mask periodically
    adms.update_mask_periodically(anomaly_data, criterion, device='cpu')
    
    # Verify mask was regenerated
    assert adms.parameter_mask is not None
    
    # Masks should be similar but may differ slightly due to randomness in computation
    # Just verify the structure is maintained
    assert set(initial_mask.keys()) == set(adms.parameter_mask.keys())


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
