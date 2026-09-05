"""
Unit tests for MIA Evaluator Module

Tests membership inference attack evaluation functionality including:
- Data split preparation for member/non-member sets
- Shadow model training on disjoint data
- Confidence score extraction
- Attack classifier training (model-based and threshold-based)
- Membership prediction on held-out test sets
- Attack success rate metrics (accuracy, precision, recall, AUC)
- DP vs non-DP model comparison
- Attack performance across privacy budgets
- Visualization generation

Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import TensorDataset, DataLoader
import numpy as np
import pytest
import os
import tempfile
from pathlib import Path

from sentryfl.privacy.mia_evaluator import MIAEvaluator


class SimpleModel(nn.Module):
    """Simple model for testing MIA evaluation"""
    def __init__(self, input_dim: int = 10, num_classes: int = 2):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, 32)
        self.fc2 = nn.Linear(32, 16)
        self.fc3 = nn.Linear(16, num_classes)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.1)
    
    def forward(self, x):
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.relu(self.fc2(x))
        x = self.fc3(x)
        return x


@pytest.fixture
def device():
    """Get available device (GPU if available, else CPU)"""
    return 'cuda' if torch.cuda.is_available() else 'cpu'


@pytest.fixture
def sample_dataset():
    """Create a simple dataset for testing"""
    np.random.seed(42)
    torch.manual_seed(42)
    
    # Generate synthetic data
    num_samples = 200
    input_dim = 10
    num_classes = 2
    
    X = torch.randn(num_samples, input_dim)
    y = torch.randint(0, num_classes, (num_samples,))
    
    dataset = TensorDataset(X, y)
    return dataset


@pytest.fixture
def target_model(device):
    """Create a simple target model"""
    model = SimpleModel(input_dim=10, num_classes=2)
    return model


@pytest.fixture
def mia_evaluator(target_model, device):
    """Create MIA evaluator instance"""
    evaluator = MIAEvaluator(
        target_model=target_model,
        shadow_model_class=SimpleModel,
        num_shadow_models=3,
        device=device
    )
    return evaluator


def test_mia_evaluator_initialization(mia_evaluator, device):
    """Test MIA evaluator initialization"""
    assert mia_evaluator.num_shadow_models == 3
    assert str(mia_evaluator.device) == device
    assert len(mia_evaluator.shadow_models) == 0
    assert mia_evaluator.attack_classifier is None
    print("✓ MIA evaluator initialization test passed")


def test_prepare_data_splits(mia_evaluator, sample_dataset):
    """
    Test data split preparation for member and non-member sets
    
    Requirements: 6.1
    """
    member_data, non_member_data = mia_evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.5
    )
    
    # Check split sizes
    total_size = len(sample_dataset)
    assert len(member_data) == int(total_size * 0.5)
    assert len(non_member_data) == total_size - int(total_size * 0.5)
    
    # Verify datasets are disjoint (no data leakage)
    # This is ensured by random_split with fixed seed
    assert len(member_data) + len(non_member_data) == total_size
    
    print(f"✓ Data split test passed: {len(member_data)} members, {len(non_member_data)} non-members")


def test_train_shadow_models(mia_evaluator, sample_dataset, device):
    """
    Test shadow model training on member and non-member data
    
    Requirements: 6.1, 6.2
    """
    # Prepare data splits
    member_data, non_member_data = mia_evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.6
    )
    
    # Train shadow models (reduced epochs for testing)
    mia_evaluator.train_shadow_models(
        member_data=member_data,
        non_member_data=non_member_data,
        epochs=3,
        batch_size=16,
        learning_rate=0.01
    )
    
    # Verify shadow models were trained
    assert len(mia_evaluator.shadow_models) == 3
    
    # Verify models are on correct device
    for model in mia_evaluator.shadow_models:
        assert next(model.parameters()).device.type == device
    
    # Verify models produce outputs
    sample_input = torch.randn(4, 10).to(device)
    for model in mia_evaluator.shadow_models:
        model.eval()
        output = model(sample_input)
        assert output.shape == (4, 2)  # batch_size=4, num_classes=2
    
    print(f"✓ Shadow model training test passed: {len(mia_evaluator.shadow_models)} models trained")


def test_extract_confidence_scores(mia_evaluator, sample_dataset, device):
    """
    Test confidence score extraction from model predictions
    
    Requirements: 6.2
    """
    # Create data loader
    data_loader = DataLoader(sample_dataset, batch_size=16, shuffle=False)
    
    # Extract confidence scores
    confidence_scores, membership_labels = mia_evaluator.extract_confidence_scores(
        data_loader=data_loader,
        model=mia_evaluator.target_model,
        is_member=True
    )
    
    # Verify output shapes
    assert confidence_scores.shape[0] == len(sample_dataset)
    assert confidence_scores.shape[1] == 2  # num_classes
    assert membership_labels.shape[0] == len(sample_dataset)
    
    # Verify confidence scores are probabilities (0 to 1, sum to 1)
    assert np.all(confidence_scores >= 0)
    assert np.all(confidence_scores <= 1)
    assert np.allclose(confidence_scores.sum(axis=1), 1.0, atol=1e-5)
    
    # Verify membership labels are correct
    assert np.all(membership_labels == 1)  # All marked as members
    
    # Test non-member extraction
    confidence_scores_nm, membership_labels_nm = mia_evaluator.extract_confidence_scores(
        data_loader=data_loader,
        model=mia_evaluator.target_model,
        is_member=False
    )
    assert np.all(membership_labels_nm == 0)  # All marked as non-members
    
    print(f"✓ Confidence score extraction test passed: shape={confidence_scores.shape}")


def test_train_attack_classifier_model_based(mia_evaluator, sample_dataset, device):
    """
    Test training of model-based attack classifier
    
    Requirements: 6.3, 6.8
    """
    # Prepare data and train shadow models
    member_data, non_member_data = mia_evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.6
    )
    
    mia_evaluator.train_shadow_models(
        member_data=member_data,
        non_member_data=non_member_data,
        epochs=3,
        batch_size=16
    )
    
    # Train attack classifier (model-based)
    mia_evaluator.train_attack_classifier(
        member_data=member_data,
        non_member_data=non_member_data,
        batch_size=16,
        attack_strategy='model_based'
    )
    
    # Verify attack classifier was trained
    assert mia_evaluator.attack_classifier is not None
    
    # Test prediction capability
    sample_features = np.random.rand(10, 2)  # 10 samples, 2 classes
    predictions = mia_evaluator.attack_classifier.predict(sample_features)
    assert predictions.shape == (10,)
    assert np.all((predictions == 0) | (predictions == 1))
    
    print("✓ Model-based attack classifier training test passed")


def test_train_attack_classifier_threshold_based(mia_evaluator, sample_dataset, device):
    """
    Test training of threshold-based attack classifier
    
    Requirements: 6.3, 6.8
    """
    # Prepare data and train shadow models
    member_data, non_member_data = mia_evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.6
    )
    
    mia_evaluator.train_shadow_models(
        member_data=member_data,
        non_member_data=non_member_data,
        epochs=3,
        batch_size=16
    )
    
    # Train attack classifier (threshold-based)
    mia_evaluator.train_attack_classifier(
        member_data=member_data,
        non_member_data=non_member_data,
        batch_size=16,
        attack_strategy='threshold_based'
    )
    
    # Verify threshold was set
    assert hasattr(mia_evaluator, 'attack_threshold')
    assert 0 <= mia_evaluator.attack_threshold <= 1
    
    print(f"✓ Threshold-based attack classifier training test passed: threshold={mia_evaluator.attack_threshold:.4f}")


def test_predict_membership(mia_evaluator, sample_dataset, device):
    """
    Test membership prediction on held-out samples
    
    Requirements: 6.4
    """
    # Prepare data and train complete pipeline
    member_data, non_member_data = mia_evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.6
    )
    
    mia_evaluator.train_shadow_models(
        member_data=member_data,
        non_member_data=non_member_data,
        epochs=3,
        batch_size=16
    )
    
    mia_evaluator.train_attack_classifier(
        member_data=member_data,
        non_member_data=non_member_data,
        batch_size=16,
        attack_strategy='model_based'
    )
    
    # Predict membership on test data
    test_loader = DataLoader(member_data, batch_size=16, shuffle=False)
    predictions = mia_evaluator.predict_membership(
        data_loader=test_loader,
        attack_strategy='model_based'
    )
    
    # Verify predictions
    assert predictions.shape == (len(member_data),)
    assert np.all((predictions == 0) | (predictions == 1))
    
    print(f"✓ Membership prediction test passed: {predictions.shape[0]} predictions made")


def test_evaluate_attack(mia_evaluator, sample_dataset, device):
    """
    Test attack evaluation with comprehensive metrics
    
    Requirements: 6.4, 6.5, 6.9
    """
    # Prepare data and train complete pipeline
    member_data, non_member_data = mia_evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.5
    )
    
    # Use smaller subsets for training shadow models
    member_train_size = int(len(member_data) * 0.6)
    non_member_train_size = int(len(non_member_data) * 0.6)
    
    member_train = torch.utils.data.Subset(member_data, range(member_train_size))
    non_member_train = torch.utils.data.Subset(non_member_data, range(non_member_train_size))
    
    member_test = torch.utils.data.Subset(member_data, range(member_train_size, len(member_data)))
    non_member_test = torch.utils.data.Subset(non_member_data, range(non_member_train_size, len(non_member_data)))
    
    # Train shadow models
    mia_evaluator.train_shadow_models(
        member_data=member_train,
        non_member_data=non_member_train,
        epochs=3,
        batch_size=16
    )
    
    # Train attack classifier
    mia_evaluator.train_attack_classifier(
        member_data=member_train,
        non_member_data=non_member_train,
        batch_size=16,
        attack_strategy='model_based'
    )
    
    # Evaluate attack on test set
    metrics = mia_evaluator.evaluate_attack(
        member_data=member_test,
        non_member_data=non_member_test,
        batch_size=16,
        attack_strategy='model_based'
    )
    
    # Verify all required metrics are present
    assert 'accuracy' in metrics
    assert 'precision' in metrics
    assert 'recall' in metrics
    assert 'auc' in metrics
    assert 'privacy_leakage' in metrics
    assert 'leakage_severity' in metrics
    
    # Verify metric ranges
    assert 0 <= metrics['accuracy'] <= 1
    assert 0 <= metrics['precision'] <= 1
    assert 0 <= metrics['recall'] <= 1
    assert 0 <= metrics['auc'] <= 1
    assert -0.5 <= metrics['privacy_leakage'] <= 0.5
    assert metrics['leakage_severity'] in ['LOW', 'MEDIUM', 'HIGH']
    
    print(f"✓ Attack evaluation test passed:")
    print(f"  Accuracy: {metrics['accuracy']:.2%}")
    print(f"  Precision: {metrics['precision']:.2%}")
    print(f"  Recall: {metrics['recall']:.2%}")
    print(f"  AUC: {metrics['auc']:.4f}")
    print(f"  Privacy Leakage: {metrics['privacy_leakage']:.2%} ({metrics['leakage_severity']})")


def test_compare_dp_vs_non_dp(sample_dataset, device):
    """
    Test comparison of attack success between DP and non-DP models
    
    Requirements: 6.6
    """
    # Create two models
    dp_model = SimpleModel(input_dim=10, num_classes=2).to(device)
    non_dp_model = SimpleModel(input_dim=10, num_classes=2).to(device)
    
    # Initialize evaluator
    evaluator = MIAEvaluator(
        target_model=non_dp_model,
        shadow_model_class=SimpleModel,
        num_shadow_models=2,
        device=device
    )
    
    # Prepare data
    member_data, non_member_data = evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.5
    )
    
    # Split into train/test
    member_train_size = int(len(member_data) * 0.6)
    non_member_train_size = int(len(non_member_data) * 0.6)
    
    member_train = torch.utils.data.Subset(member_data, range(member_train_size))
    non_member_train = torch.utils.data.Subset(non_member_data, range(non_member_train_size))
    
    member_test = torch.utils.data.Subset(member_data, range(member_train_size, len(member_data)))
    non_member_test = torch.utils.data.Subset(non_member_data, range(non_member_train_size, len(non_member_data)))
    
    # Train shadow models and attack classifier
    evaluator.train_shadow_models(
        member_data=member_train,
        non_member_data=non_member_train,
        epochs=3,
        batch_size=16
    )
    
    evaluator.train_attack_classifier(
        member_data=member_train,
        non_member_data=non_member_train,
        batch_size=16
    )
    
    # Compare DP vs non-DP
    comparison = evaluator.compare_dp_vs_non_dp(
        dp_model=dp_model,
        non_dp_model=non_dp_model,
        member_data=member_test,
        non_member_data=non_member_test,
        batch_size=16
    )
    
    # Verify comparison structure
    assert 'dp' in comparison
    assert 'non_dp' in comparison
    assert 'privacy_gain' in comparison
    
    # Verify metrics present
    assert 'accuracy' in comparison['dp']
    assert 'accuracy' in comparison['non_dp']
    
    # Privacy gain can be positive or negative
    assert isinstance(comparison['privacy_gain'], float)
    
    print(f"✓ DP vs non-DP comparison test passed:")
    print(f"  Non-DP Attack Accuracy: {comparison['non_dp']['accuracy']:.2%}")
    print(f"  DP Attack Accuracy: {comparison['dp']['accuracy']:.2%}")
    print(f"  Privacy Gain: {comparison['privacy_gain']:.2%}")


def test_log_attack_performance_by_privacy_budget(sample_dataset, device):
    """
    Test logging attack performance across different privacy budgets
    
    Requirements: 6.7
    """
    # Create models with different epsilon values (simulated)
    models_by_epsilon = {
        1.0: SimpleModel(input_dim=10, num_classes=2).to(device),
        5.0: SimpleModel(input_dim=10, num_classes=2).to(device),
        10.0: SimpleModel(input_dim=10, num_classes=2).to(device)
    }
    
    # Initialize evaluator
    evaluator = MIAEvaluator(
        target_model=models_by_epsilon[1.0],
        shadow_model_class=SimpleModel,
        num_shadow_models=2,
        device=device
    )
    
    # Prepare data
    member_data, non_member_data = evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.5
    )
    
    # Split into train/test
    member_train_size = int(len(member_data) * 0.6)
    non_member_train_size = int(len(non_member_data) * 0.6)
    
    member_train = torch.utils.data.Subset(member_data, range(member_train_size))
    non_member_train = torch.utils.data.Subset(non_member_data, range(non_member_train_size))
    
    member_test = torch.utils.data.Subset(member_data, range(member_train_size, len(member_data)))
    non_member_test = torch.utils.data.Subset(non_member_data, range(non_member_train_size, len(non_member_data)))
    
    # Train shadow models and attack classifier
    evaluator.train_shadow_models(
        member_data=member_train,
        non_member_data=non_member_train,
        epochs=3,
        batch_size=16
    )
    
    evaluator.train_attack_classifier(
        member_data=member_train,
        non_member_data=non_member_train,
        batch_size=16
    )
    
    # Log attack performance across privacy budgets
    results_by_epsilon = evaluator.log_attack_performance_by_privacy_budget(
        models_by_epsilon=models_by_epsilon,
        member_data=member_test,
        non_member_data=non_member_test,
        batch_size=16
    )
    
    # Verify results structure
    assert len(results_by_epsilon) == 3
    assert 1.0 in results_by_epsilon
    assert 5.0 in results_by_epsilon
    assert 10.0 in results_by_epsilon
    
    # Verify each epsilon has complete metrics
    for epsilon, metrics in results_by_epsilon.items():
        assert 'accuracy' in metrics
        assert 'precision' in metrics
        assert 'recall' in metrics
        assert 'auc' in metrics
        assert 'privacy_leakage' in metrics
        
        print(f"  ε={epsilon}: Accuracy={metrics['accuracy']:.2%}, AUC={metrics['auc']:.4f}")
    
    print("✓ Attack performance by privacy budget test passed")


def test_plot_attack_performance(sample_dataset, device):
    """
    Test attack performance visualization generation
    
    Requirements: 6.10
    """
    # Create models with different epsilon values
    models_by_epsilon = {
        1.0: SimpleModel(input_dim=10, num_classes=2).to(device),
        5.0: SimpleModel(input_dim=10, num_classes=2).to(device),
        10.0: SimpleModel(input_dim=10, num_classes=2).to(device)
    }
    
    # Initialize evaluator
    evaluator = MIAEvaluator(
        target_model=models_by_epsilon[1.0],
        shadow_model_class=SimpleModel,
        num_shadow_models=2,
        device=device
    )
    
    # Prepare data
    member_data, non_member_data = evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.5
    )
    
    # Split into train/test
    member_train_size = int(len(member_data) * 0.6)
    non_member_train_size = int(len(non_member_data) * 0.6)
    
    member_train = torch.utils.data.Subset(member_data, range(member_train_size))
    non_member_train = torch.utils.data.Subset(non_member_data, range(non_member_train_size))
    
    member_test = torch.utils.data.Subset(member_data, range(member_train_size, len(member_data)))
    non_member_test = torch.utils.data.Subset(non_member_data, range(non_member_train_size, len(non_member_data)))
    
    # Train shadow models and attack classifier
    evaluator.train_shadow_models(
        member_data=member_train,
        non_member_data=non_member_train,
        epochs=3,
        batch_size=16
    )
    
    evaluator.train_attack_classifier(
        member_data=member_train,
        non_member_data=non_member_train,
        batch_size=16
    )
    
    # Log attack performance
    results_by_epsilon = evaluator.log_attack_performance_by_privacy_budget(
        models_by_epsilon=models_by_epsilon,
        member_data=member_test,
        non_member_data=non_member_test,
        batch_size=16
    )
    
    # Test plotting with save
    with tempfile.TemporaryDirectory() as tmpdir:
        save_path = Path(tmpdir) / "attack_performance.png"
        
        # Generate plot
        evaluator.plot_attack_performance(
            results_by_epsilon=results_by_epsilon,
            save_path=str(save_path)
        )
        
        # Verify plot was saved
        assert save_path.exists()
        assert save_path.stat().st_size > 0
        
        print(f"✓ Attack performance visualization test passed: plot saved to {save_path}")


def test_plot_roc_curve(mia_evaluator, sample_dataset, device):
    """
    Test ROC curve visualization generation
    
    Requirements: 6.10
    """
    # Prepare data
    member_data, non_member_data = mia_evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.5
    )
    
    # Split into train/test
    member_train_size = int(len(member_data) * 0.6)
    non_member_train_size = int(len(non_member_data) * 0.6)
    
    member_train = torch.utils.data.Subset(member_data, range(member_train_size))
    non_member_train = torch.utils.data.Subset(non_member_data, range(non_member_train_size))
    
    member_test = torch.utils.data.Subset(member_data, range(member_train_size, len(member_data)))
    non_member_test = torch.utils.data.Subset(non_member_data, range(non_member_train_size, len(non_member_data)))
    
    # Train shadow models and attack classifier
    mia_evaluator.train_shadow_models(
        member_data=member_train,
        non_member_data=non_member_train,
        epochs=3,
        batch_size=16
    )
    
    mia_evaluator.train_attack_classifier(
        member_data=member_train,
        non_member_data=non_member_train,
        batch_size=16
    )
    
    # Test ROC curve plotting with save
    with tempfile.TemporaryDirectory() as tmpdir:
        save_path = Path(tmpdir) / "roc_curve.png"
        
        # Generate ROC curve
        mia_evaluator.plot_roc_curve(
            member_data=member_test,
            non_member_data=non_member_test,
            batch_size=16,
            save_path=str(save_path)
        )
        
        # Verify plot was saved
        assert save_path.exists()
        assert save_path.stat().st_size > 0
        
        print(f"✓ ROC curve visualization test passed: plot saved to {save_path}")


def test_get_attack_summary(mia_evaluator, sample_dataset):
    """
    Test getting comprehensive attack summary
    
    Requirements: 6.5, 6.7
    """
    # Prepare data and train complete pipeline
    member_data, non_member_data = mia_evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.6
    )
    
    mia_evaluator.train_shadow_models(
        member_data=member_data,
        non_member_data=non_member_data,
        epochs=3,
        batch_size=16
    )
    
    mia_evaluator.train_attack_classifier(
        member_data=member_data,
        non_member_data=non_member_data,
        batch_size=16
    )
    
    # Get summary
    summary = mia_evaluator.get_attack_summary()
    
    # Verify summary structure
    assert 'num_shadow_models' in summary
    assert 'attack_classifier_type' in summary
    assert 'attack_metrics' in summary
    assert 'device' in summary
    assert 'shadow_models_trained' in summary
    assert 'attack_classifier_trained' in summary
    
    # Verify values
    assert summary['num_shadow_models'] == 3
    assert summary['shadow_models_trained'] == True
    assert summary['attack_classifier_trained'] == True
    assert summary['attack_classifier_type'] == 'LogisticRegression'
    
    print("✓ Attack summary test passed")


def test_evaluator_reset(mia_evaluator, sample_dataset):
    """Test evaluator state reset functionality"""
    # Train some components
    member_data, non_member_data = mia_evaluator.prepare_data_splits(
        sample_dataset, member_ratio=0.6
    )
    
    mia_evaluator.train_shadow_models(
        member_data=member_data,
        non_member_data=non_member_data,
        epochs=2,
        batch_size=16
    )
    
    # Verify state is populated
    assert len(mia_evaluator.shadow_models) > 0
    
    # Reset
    mia_evaluator.reset()
    
    # Verify state is cleared
    assert len(mia_evaluator.shadow_models) == 0
    assert mia_evaluator.attack_classifier is None
    assert len(mia_evaluator.confidence_scores) == 0
    assert len(mia_evaluator.attack_metrics) == 0
    
    print("✓ Evaluator reset test passed")


def test_evaluator_repr(mia_evaluator):
    """Test string representation"""
    repr_str = repr(mia_evaluator)
    
    assert 'MIAEvaluator' in repr_str
    assert 'num_shadow_models=3' in repr_str
    assert 'device=' in repr_str
    
    print(f"✓ Evaluator repr test passed: {repr_str}")


if __name__ == '__main__':
    # Run tests with pytest
    pytest.main([__file__, '-v', '-s'])
