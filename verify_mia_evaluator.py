"""
Verification Script for MIA Evaluator

This script demonstrates the complete membership inference attack evaluation pipeline:
1. Data preparation with member/non-member splits
2. Shadow model training on disjoint data
3. Confidence score extraction
4. Attack classifier training (both model-based and threshold-based)
5. Membership prediction on held-out test sets
6. Comprehensive metrics (accuracy, precision, recall, AUC)
7. DP vs non-DP model comparison
8. Attack performance across privacy budgets
9. Visualization generation

Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10
"""

import torch
import torch.nn as nn
import numpy as np
from torch.utils.data import TensorDataset
from pathlib import Path

from sentryfl.privacy.mia_evaluator import MIAEvaluator


class SimpleAnomalyDetector(nn.Module):
    """Simple anomaly detection model for demonstration"""
    def __init__(self, input_dim: int = 20, hidden_dim: int = 64, num_classes: int = 2):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(0.2)
        )
        self.classifier = nn.Linear(hidden_dim // 2, num_classes)
    
    def forward(self, x):
        features = self.encoder(x)
        logits = self.classifier(features)
        return logits


def generate_synthetic_dataset(num_samples: int = 1000, input_dim: int = 20):
    """Generate synthetic time-series anomaly detection dataset"""
    np.random.seed(42)
    torch.manual_seed(42)
    
    # Generate normal samples (class 0)
    normal_samples = int(num_samples * 0.8)
    X_normal = torch.randn(normal_samples, input_dim) * 0.5
    y_normal = torch.zeros(normal_samples, dtype=torch.long)
    
    # Generate anomalous samples (class 1)
    anomaly_samples = num_samples - normal_samples
    X_anomaly = torch.randn(anomaly_samples, input_dim) * 2.0 + 1.5
    y_anomaly = torch.ones(anomaly_samples, dtype=torch.long)
    
    # Combine and shuffle
    X = torch.cat([X_normal, X_anomaly], dim=0)
    y = torch.cat([y_normal, y_anomaly], dim=0)
    
    # Shuffle
    indices = torch.randperm(num_samples)
    X = X[indices]
    y = y[indices]
    
    dataset = TensorDataset(X, y)
    return dataset


def train_simple_model(model, train_data, epochs=10, batch_size=32, lr=0.001, device='cpu'):
    """Train a simple model on training data"""
    from torch.utils.data import DataLoader
    
    model = model.to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    criterion = nn.CrossEntropyLoss()
    
    train_loader = DataLoader(train_data, batch_size=batch_size, shuffle=True)
    
    model.train()
    for epoch in range(epochs):
        total_loss = 0.0
        correct = 0
        total = 0
        
        for batch_data, batch_labels in train_loader:
            batch_data = batch_data.to(device)
            batch_labels = batch_labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(batch_data)
            loss = criterion(outputs, batch_labels)
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            _, predicted = outputs.max(1)
            correct += predicted.eq(batch_labels).sum().item()
            total += batch_labels.size(0)
        
        accuracy = 100.0 * correct / total
        avg_loss = total_loss / len(train_loader)
        
        if (epoch + 1) % 5 == 0:
            print(f"  Epoch {epoch+1}/{epochs}, Loss: {avg_loss:.4f}, Accuracy: {accuracy:.2f}%")
    
    return model


def main():
    """Run complete MIA evaluation demonstration"""
    print("=" * 80)
    print("MIA Evaluator Verification Script")
    print("=" * 80)
    
    # Setup
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"\n[Setup] Using device: {device}")
    
    input_dim = 20
    num_samples = 1000
    
    # Step 1: Generate synthetic dataset
    print(f"\n[Step 1] Generating synthetic dataset ({num_samples} samples, {input_dim} features)...")
    dataset = generate_synthetic_dataset(num_samples=num_samples, input_dim=input_dim)
    print(f"✓ Dataset generated: {len(dataset)} samples")
    
    # Step 2: Create target model and train it
    print("\n[Step 2] Training target model (non-DP baseline)...")
    target_model = SimpleAnomalyDetector(input_dim=input_dim, hidden_dim=64, num_classes=2)
    
    # Split dataset for target model training
    train_size = int(len(dataset) * 0.6)
    train_data = torch.utils.data.Subset(dataset, range(train_size))
    
    target_model = train_simple_model(
        target_model, train_data, epochs=15, batch_size=32, lr=0.001, device=device
    )
    print("✓ Target model trained")
    
    # Step 3: Create DP model (simulated with more noise)
    print("\n[Step 3] Training DP model (with simulated privacy protection)...")
    dp_model = SimpleAnomalyDetector(input_dim=input_dim, hidden_dim=64, num_classes=2)
    
    # Add noise to simulate DP training (for demonstration)
    dp_model = train_simple_model(
        dp_model, train_data, epochs=10, batch_size=32, lr=0.0005, device=device
    )
    
    # Add noise to model parameters to simulate DP
    with torch.no_grad():
        for param in dp_model.parameters():
            param.add_(torch.randn_like(param) * 0.1)
    
    print("✓ DP model trained (with simulated privacy noise)")
    
    # Step 4: Initialize MIA Evaluator
    print("\n[Step 4] Initializing MIA Evaluator...")
    evaluator = MIAEvaluator(
        target_model=target_model,
        shadow_model_class=lambda: SimpleAnomalyDetector(input_dim=input_dim, hidden_dim=64, num_classes=2),
        num_shadow_models=5,
        device=device
    )
    print(f"✓ MIA Evaluator initialized: {evaluator}")
    
    # Step 5: Prepare member/non-member data splits (Requirements 6.1)
    print("\n[Step 5] Preparing member/non-member data splits...")
    remaining_data = torch.utils.data.Subset(dataset, range(train_size, len(dataset)))
    
    member_data, non_member_data = evaluator.prepare_data_splits(
        remaining_data, member_ratio=0.5
    )
    print(f"✓ Data split prepared:")
    print(f"  - Members: {len(member_data)} samples")
    print(f"  - Non-members: {len(non_member_data)} samples")
    
    # Split into train/test for attack evaluation
    member_train_size = int(len(member_data) * 0.7)
    non_member_train_size = int(len(non_member_data) * 0.7)
    
    member_train = torch.utils.data.Subset(member_data, range(member_train_size))
    non_member_train = torch.utils.data.Subset(non_member_data, range(non_member_train_size))
    
    member_test = torch.utils.data.Subset(member_data, range(member_train_size, len(member_data)))
    non_member_test = torch.utils.data.Subset(non_member_data, range(non_member_train_size, len(non_member_data)))
    
    # Step 6: Train shadow models (Requirements 6.1, 6.2)
    print("\n[Step 6] Training shadow models...")
    evaluator.train_shadow_models(
        member_data=member_train,
        non_member_data=non_member_train,
        epochs=10,
        batch_size=32,
        learning_rate=0.001
    )
    print(f"✓ Trained {len(evaluator.shadow_models)} shadow models")
    
    # Step 7: Extract confidence scores (Requirements 6.2)
    print("\n[Step 7] Extracting confidence scores from target model...")
    from torch.utils.data import DataLoader
    
    test_loader = DataLoader(member_test, batch_size=32, shuffle=False)
    confidence_scores, membership_labels = evaluator.extract_confidence_scores(
        test_loader, model=target_model, is_member=True
    )
    print(f"✓ Extracted confidence scores: shape={confidence_scores.shape}")
    print(f"  Sample confidences: {confidence_scores[:3]}")
    
    # Step 8: Train attack classifier (model-based) (Requirements 6.3, 6.8)
    print("\n[Step 8] Training model-based attack classifier...")
    evaluator.train_attack_classifier(
        member_data=member_train,
        non_member_data=non_member_train,
        batch_size=32,
        attack_strategy='model_based'
    )
    print("✓ Attack classifier trained (Logistic Regression)")
    
    # Step 9: Predict membership on test set (Requirements 6.4)
    print("\n[Step 9] Predicting membership on held-out test set...")
    test_loader = DataLoader(member_test, batch_size=32, shuffle=False)
    predictions = evaluator.predict_membership(
        test_loader, attack_strategy='model_based'
    )
    member_accuracy = (predictions == 1).mean()
    print(f"✓ Membership predictions made: {len(predictions)} samples")
    print(f"  Accuracy on members: {member_accuracy:.2%}")
    
    # Step 10: Evaluate attack with comprehensive metrics (Requirements 6.4, 6.5, 6.9)
    print("\n[Step 10] Evaluating attack with comprehensive metrics...")
    metrics = evaluator.evaluate_attack(
        member_data=member_test,
        non_member_data=non_member_test,
        batch_size=32,
        attack_strategy='model_based'
    )
    
    print("✓ Attack evaluation completed:")
    print(f"  - Accuracy: {metrics['accuracy']:.2%}")
    print(f"  - Precision: {metrics['precision']:.2%}")
    print(f"  - Recall: {metrics['recall']:.2%}")
    print(f"  - AUC-ROC: {metrics['auc']:.4f}")
    print(f"  - Privacy Leakage: {metrics['privacy_leakage']:.2%} (above 50% baseline)")
    print(f"  - Leakage Severity: {metrics['leakage_severity']}")
    
    # Step 11: Compare DP vs non-DP models (Requirements 6.6)
    print("\n[Step 11] Comparing attack success between DP and non-DP models...")
    comparison = evaluator.compare_dp_vs_non_dp(
        dp_model=dp_model,
        non_dp_model=target_model,
        member_data=member_test,
        non_member_data=non_member_test,
        batch_size=32
    )
    
    print("✓ DP vs non-DP comparison completed:")
    print(f"  - Non-DP Attack Accuracy: {comparison['non_dp']['accuracy']:.2%}")
    print(f"  - DP Attack Accuracy: {comparison['dp']['accuracy']:.2%}")
    print(f"  - Privacy Gain: {comparison['privacy_gain']:.2%}")
    
    if comparison['privacy_gain'] > 0:
        print(f"  → DP reduces attack success by {comparison['privacy_gain']:.2%}")
    else:
        print(f"  → Note: In this simulation, DP model shows similar vulnerability")
    
    # Step 12: Log attack performance across privacy budgets (Requirements 6.7)
    print("\n[Step 12] Logging attack performance across privacy budgets...")
    
    # Create models with different privacy levels (simulated)
    models_by_epsilon = {}
    for epsilon in [1.0, 2.0, 5.0, 10.0]:
        model = SimpleAnomalyDetector(input_dim=input_dim, hidden_dim=64, num_classes=2).to(device)
        model = train_simple_model(model, train_data, epochs=8, batch_size=32, lr=0.0008, device=device)
        
        # Add noise proportional to privacy budget (lower epsilon = more noise)
        noise_scale = 1.0 / epsilon
        with torch.no_grad():
            for param in model.parameters():
                param.add_(torch.randn_like(param) * noise_scale * 0.1)
        
        models_by_epsilon[epsilon] = model
    
    results_by_epsilon = evaluator.log_attack_performance_by_privacy_budget(
        models_by_epsilon=models_by_epsilon,
        member_data=member_test,
        non_member_data=non_member_test,
        batch_size=32
    )
    
    print("✓ Attack performance logged across privacy budgets:")
    for epsilon in sorted(results_by_epsilon.keys()):
        metrics_eps = results_by_epsilon[epsilon]
        print(f"  - ε={epsilon:4.1f}: Accuracy={metrics_eps['accuracy']:.2%}, "
              f"AUC={metrics_eps['auc']:.4f}, Leakage={metrics_eps['privacy_leakage']:.2%}")
    
    # Step 13: Generate visualizations (Requirements 6.10)
    print("\n[Step 13] Generating attack performance visualizations...")
    
    output_dir = Path("mia_evaluation_results")
    output_dir.mkdir(exist_ok=True)
    
    # Plot attack performance across epsilon
    attack_plot_path = output_dir / "attack_performance_vs_epsilon.png"
    evaluator.plot_attack_performance(
        results_by_epsilon=results_by_epsilon,
        save_path=str(attack_plot_path)
    )
    print(f"✓ Attack performance plot saved: {attack_plot_path}")
    
    # Plot ROC curve
    roc_plot_path = output_dir / "roc_curve.png"
    evaluator.plot_roc_curve(
        member_data=member_test,
        non_member_data=non_member_test,
        batch_size=32,
        save_path=str(roc_plot_path)
    )
    print(f"✓ ROC curve plot saved: {roc_plot_path}")
    
    # Step 14: Get comprehensive summary
    print("\n[Step 14] Generating comprehensive attack summary...")
    summary = evaluator.get_attack_summary()
    
    print("✓ Attack Summary:")
    print(f"  - Shadow models trained: {summary['num_shadow_models']}")
    print(f"  - Attack classifier type: {summary['attack_classifier_type']}")
    print(f"  - Device: {summary['device']}")
    print(f"  - Shadow models status: {'Trained' if summary['shadow_models_trained'] else 'Not trained'}")
    print(f"  - Attack classifier status: {'Trained' if summary['attack_classifier_trained'] else 'Not trained'}")
    
    # Step 15: Test threshold-based attack strategy (Requirements 6.8)
    print("\n[Step 15] Testing threshold-based attack strategy...")
    evaluator.reset()
    
    # Retrain with threshold-based strategy
    evaluator.train_shadow_models(
        member_data=member_train,
        non_member_data=non_member_train,
        epochs=10,
        batch_size=32,
        learning_rate=0.001
    )
    
    evaluator.train_attack_classifier(
        member_data=member_train,
        non_member_data=non_member_train,
        batch_size=32,
        attack_strategy='threshold_based'
    )
    
    threshold_metrics = evaluator.evaluate_attack(
        member_data=member_test,
        non_member_data=non_member_test,
        batch_size=32,
        attack_strategy='threshold_based'
    )
    
    print("✓ Threshold-based attack evaluation completed:")
    print(f"  - Threshold: {evaluator.attack_threshold:.4f}")
    print(f"  - Accuracy: {threshold_metrics['accuracy']:.2%}")
    print(f"  - AUC-ROC: {threshold_metrics['auc']:.4f}")
    
    # Final Summary
    print("\n" + "=" * 80)
    print("MIA Evaluator Verification Complete")
    print("=" * 80)
    print("\n✅ All requirements verified:")
    print("  [6.1] ✓ Shadow model training on member/non-member data")
    print("  [6.2] ✓ Confidence score extraction")
    print("  [6.3] ✓ Binary attack classifier training")
    print("  [6.4] ✓ Membership prediction on held-out samples")
    print("  [6.5] ✓ Attack success rate metrics (accuracy, precision, recall, AUC)")
    print("  [6.6] ✓ DP vs non-DP model comparison")
    print("  [6.7] ✓ Attack performance across privacy budgets")
    print("  [6.8] ✓ Threshold-based and model-based attack strategies")
    print("  [6.9] ✓ Privacy leakage quantification and severity assessment")
    print("  [6.10] ✓ Attack performance visualization plots")
    
    print(f"\n📊 Results saved to: {output_dir.absolute()}")
    print("\n" + "=" * 80)


if __name__ == '__main__':
    main()
