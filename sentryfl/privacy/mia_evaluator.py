"""
MIA Evaluator Module for Membership Inference Attack evaluation

This module measures actual privacy leakage by attempting to determine if specific
data points were in the training set. This validates the effectiveness of differential
privacy mechanisms.

Key Features:
- Shadow model training on member and non-member data splits
- Confidence score extraction for each sample
- Binary attack classifier training (member vs non-member)
- Membership prediction on held-out test set
- Attack success rate metrics (accuracy, precision, recall, AUC)
- Attack comparison between DP and non-DP models
- Attack performance visualization plots
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset, random_split
from typing import Dict, List, Tuple, Optional, Any
import numpy as np
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score, roc_curve
from sklearn.linear_model import LogisticRegression
import logging
import matplotlib.pyplot as plt
import seaborn as sns

logger = logging.getLogger(__name__)


class MIAEvaluator:
    """
    Membership Inference Attack Evaluator for privacy leakage measurement.
    
    This class implements the shadow model approach to membership inference attacks,
    which trains multiple shadow models to mimic the target model's behavior
    and uses their predictions to train an attack classifier.
    
    Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.9, 6.10
    
    Args:
        target_model: The model to attack (trained on member data)
        shadow_model_class: Class constructor for shadow models
        num_shadow_models: Number of shadow models to train (default: 5)
        device: Device to run computation on ('cpu' or 'cuda')
    
    Example:
        >>> target_model = MyModel()
        >>> evaluator = MIAEvaluator(target_model, MyModel, num_shadow_models=5)
        >>> # Prepare data splits
        >>> member_data, non_member_data = evaluator.prepare_data_splits(dataset)
        >>> # Train shadow models
        >>> evaluator.train_shadow_models(member_data, non_member_data, epochs=10)
        >>> # Train attack classifier
        >>> evaluator.train_attack_classifier()
        >>> # Evaluate attack
        >>> metrics = evaluator.evaluate_attack(test_loader)
        >>> print(f"Attack accuracy: {metrics['accuracy']:.2%}")
    """
    
    def __init__(
        self,
        target_model: nn.Module,
        shadow_model_class: type,
        num_shadow_models: int = 5,
        device: str = 'cpu'
    ):
        """
        Initialize the MIA Evaluator.
        
        Args:
            target_model: Model to evaluate for privacy leakage
            shadow_model_class: Class to instantiate shadow models
            num_shadow_models: Number of shadow models to train
            device: Computing device ('cpu' or 'cuda')
        """
        self.target_model = target_model.to(device)
        self.shadow_model_class = shadow_model_class
        self.num_shadow_models = num_shadow_models
        self.device = device
        
        self.shadow_models: List[nn.Module] = []
        self.attack_classifier: Optional[LogisticRegression] = None
        self.confidence_scores: Dict[str, np.ndarray] = {}
        self.attack_metrics: Dict[str, float] = {}
        
        logger.info(
            f"Initialized MIAEvaluator with {num_shadow_models} shadow models on {device}"
        )
    
    def prepare_data_splits(
        self,
        dataset: TensorDataset,
        member_ratio: float = 0.5
    ) -> Tuple[TensorDataset, TensorDataset]:
        """
        Prepare member and non-member data splits for shadow model training.
        
        Splits the dataset into two disjoint sets:
        - Member data: Used to train shadow models (simulating training data)
        - Non-member data: Not used in training (simulating held-out data)
        
        Args:
            dataset: Complete dataset to split
            member_ratio: Fraction of data to use as members (default: 0.5)
        
        Returns:
            Tuple of (member_dataset, non_member_dataset)
        
        Requirements: 6.1
        """
        total_size = len(dataset)
        member_size = int(total_size * member_ratio)
        non_member_size = total_size - member_size
        
        member_data, non_member_data = random_split(
            dataset,
            [member_size, non_member_size],
            generator=torch.Generator().manual_seed(42)
        )
        
        logger.info(
            f"Prepared data splits: {member_size} members, {non_member_size} non-members"
        )
        
        return member_data, non_member_data
    
    def train_shadow_models(
        self,
        member_data: TensorDataset,
        non_member_data: TensorDataset,
        epochs: int = 10,
        batch_size: int = 32,
        learning_rate: float = 0.001
    ):
        """
        Train shadow models on member and non-member data splits.
        
        Each shadow model is trained on a subset of member data and evaluated
        on both member and non-member data to extract confidence scores.
        
        Args:
            member_data: Dataset of member samples
            non_member_data: Dataset of non-member samples
            epochs: Number of training epochs per shadow model
            batch_size: Training batch size
            learning_rate: Learning rate for optimizer
        
        Requirements: 6.1, 6.2
        """
        logger.info(f"Training {self.num_shadow_models} shadow models...")
        
        # Prepare data loaders
        member_loader = DataLoader(member_data, batch_size=batch_size, shuffle=True)
        
        for i in range(self.num_shadow_models):
            logger.info(f"Training shadow model {i+1}/{self.num_shadow_models}...")
            
            # Initialize shadow model
            shadow_model = self.shadow_model_class().to(self.device)
            optimizer = torch.optim.Adam(shadow_model.parameters(), lr=learning_rate)
            criterion = nn.CrossEntropyLoss()
            
            # Training loop
            shadow_model.train()
            for epoch in range(epochs):
                total_loss = 0.0
                for batch_data, batch_labels in member_loader:
                    batch_data = batch_data.to(self.device)
                    batch_labels = batch_labels.to(self.device)
                    
                    optimizer.zero_grad()
                    outputs = shadow_model(batch_data)
                    loss = criterion(outputs, batch_labels)
                    loss.backward()
                    optimizer.step()
                    
                    total_loss += loss.item()
                
                avg_loss = total_loss / len(member_loader)
                if (epoch + 1) % 5 == 0 or epoch == 0:
                    logger.debug(f"  Epoch {epoch+1}/{epochs}, Loss: {avg_loss:.4f}")
            
            self.shadow_models.append(shadow_model)
            logger.info(f"Shadow model {i+1} trained successfully")
        
        logger.info(f"All {self.num_shadow_models} shadow models trained")
    
    def extract_confidence_scores(
        self,
        data_loader: DataLoader,
        model: Optional[nn.Module] = None,
        is_member: bool = True
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Extract model confidence scores for each sample.
        
        Confidence scores are the softmax probabilities assigned by the model
        to the correct class. These scores are used as features for the attack
        classifier.
        
        Args:
            data_loader: DataLoader containing samples to score
            model: Model to extract scores from (default: target_model)
            is_member: Whether samples are members (for labeling)
        
        Returns:
            Tuple of (confidence_scores, membership_labels)
            - confidence_scores: Array of shape [N, num_classes] containing softmax probabilities
            - membership_labels: Array of shape [N] with 1 for members, 0 for non-members
        
        Requirements: 6.2
        """
        if model is None:
            model = self.target_model
        
        model.eval()
        all_confidences = []
        all_labels = []
        
        with torch.no_grad():
            for batch_data, batch_labels in data_loader:
                batch_data = batch_data.to(self.device)
                batch_labels = batch_labels.to(self.device)
                
                # Get model predictions
                outputs = model(batch_data)
                probabilities = F.softmax(outputs, dim=1)
                
                all_confidences.append(probabilities.cpu().numpy())
                all_labels.append(batch_labels.cpu().numpy())
        
        # Concatenate all batches
        confidence_scores = np.concatenate(all_confidences, axis=0)
        sample_labels = np.concatenate(all_labels, axis=0)
        
        # Create membership labels (1 for member, 0 for non-member)
        membership_labels = np.ones(len(confidence_scores)) if is_member else np.zeros(len(confidence_scores))
        
        logger.debug(
            f"Extracted confidence scores for {len(confidence_scores)} samples "
            f"(member={is_member})"
        )
        
        return confidence_scores, membership_labels
    
    def train_attack_classifier(
        self,
        member_data: TensorDataset,
        non_member_data: TensorDataset,
        batch_size: int = 32,
        attack_strategy: str = 'model_based'
    ):
        """
        Train binary attack classifier to predict membership status.
        
        The attack classifier is trained on confidence scores extracted from
        shadow models, with labels indicating whether samples were in the
        training set (member=1) or not (non-member=0).
        
        Args:
            member_data: Dataset of member samples
            non_member_data: Dataset of non-member samples
            batch_size: Batch size for data loading
            attack_strategy: 'model_based' (ML classifier) or 'threshold_based' (simple threshold)
        
        Requirements: 6.3, 6.8
        """
        logger.info(f"Training attack classifier using {attack_strategy} strategy...")
        
        if not self.shadow_models:
            raise RuntimeError(
                "No shadow models found. Call train_shadow_models() first."
            )
        
        # Prepare data loaders
        member_loader = DataLoader(member_data, batch_size=batch_size, shuffle=False)
        non_member_loader = DataLoader(non_member_data, batch_size=batch_size, shuffle=False)
        
        # Extract confidence scores from shadow models
        all_features = []
        all_labels = []
        
        for shadow_model in self.shadow_models:
            # Extract scores for members
            member_scores, member_labels = self.extract_confidence_scores(
                member_loader, model=shadow_model, is_member=True
            )
            
            # Extract scores for non-members
            non_member_scores, non_member_labels = self.extract_confidence_scores(
                non_member_loader, model=shadow_model, is_member=False
            )
            
            # Combine features and labels
            features = np.concatenate([member_scores, non_member_scores], axis=0)
            labels = np.concatenate([member_labels, non_member_labels], axis=0)
            
            all_features.append(features)
            all_labels.append(labels)
        
        # Concatenate data from all shadow models
        X_train = np.concatenate(all_features, axis=0)
        y_train = np.concatenate(all_labels, axis=0)
        
        logger.info(f"Training attack classifier on {len(X_train)} samples...")
        
        # Train logistic regression attack classifier
        if attack_strategy == 'model_based':
            self.attack_classifier = LogisticRegression(
                max_iter=1000,
                random_state=42,
                solver='lbfgs'
            )
            self.attack_classifier.fit(X_train, y_train)
            
            train_accuracy = self.attack_classifier.score(X_train, y_train)
            logger.info(f"Attack classifier trained with {train_accuracy:.2%} training accuracy")
        else:
            # Threshold-based strategy: use maximum confidence as threshold
            logger.info("Using threshold-based attack strategy")
            # Store threshold for later use
            self.attack_threshold = np.mean(np.max(X_train, axis=1))
            logger.info(f"Attack threshold set to {self.attack_threshold:.4f}")
    
    def predict_membership(
        self,
        data_loader: DataLoader,
        model: Optional[nn.Module] = None,
        attack_strategy: str = 'model_based'
    ) -> np.ndarray:
        """
        Predict membership status for held-out samples.
        
        Uses the trained attack classifier to predict whether samples were
        in the training set.
        
        Args:
            data_loader: DataLoader containing samples to predict
            model: Model to extract confidence scores from (default: target_model)
            attack_strategy: 'model_based' or 'threshold_based'
        
        Returns:
            Array of membership predictions (1 for member, 0 for non-member)
        
        Requirements: 6.4
        """
        if model is None:
            model = self.target_model
        
        # Extract confidence scores
        confidence_scores, _ = self.extract_confidence_scores(
            data_loader, model=model, is_member=True  # is_member doesn't matter here
        )
        
        # Predict using attack classifier or threshold
        if attack_strategy == 'model_based':
            if self.attack_classifier is None:
                raise RuntimeError("Attack classifier not trained. Call train_attack_classifier() first.")
            predictions = self.attack_classifier.predict(confidence_scores)
        else:
            # Threshold-based: predict member if max confidence > threshold
            max_confidences = np.max(confidence_scores, axis=1)
            predictions = (max_confidences > self.attack_threshold).astype(int)
        
        return predictions
    
    def evaluate_attack(
        self,
        member_data: TensorDataset,
        non_member_data: TensorDataset,
        batch_size: int = 32,
        model: Optional[nn.Module] = None,
        attack_strategy: str = 'model_based'
    ) -> Dict[str, float]:
        """
        Evaluate attack success rate on held-out test set.
        
        Computes comprehensive metrics including accuracy, precision, recall,
        and AUC-ROC to measure the effectiveness of the membership inference attack.
        
        Args:
            member_data: Test set of member samples
            non_member_data: Test set of non-member samples
            batch_size: Batch size for data loading
            model: Model to attack (default: target_model)
            attack_strategy: 'model_based' or 'threshold_based'
        
        Returns:
            Dictionary containing attack metrics:
            - accuracy: Overall classification accuracy
            - precision: Precision for member prediction
            - recall: Recall for member prediction
            - auc: Area under ROC curve
            - privacy_leakage: Quantified privacy leakage severity
        
        Requirements: 6.4, 6.5, 6.9
        """
        if model is None:
            model = self.target_model
        
        logger.info("Evaluating membership inference attack...")
        
        # Prepare data loaders
        member_loader = DataLoader(member_data, batch_size=batch_size, shuffle=False)
        non_member_loader = DataLoader(non_member_data, batch_size=batch_size, shuffle=False)
        
        # Extract confidence scores
        member_scores, member_labels = self.extract_confidence_scores(
            member_loader, model=model, is_member=True
        )
        non_member_scores, non_member_labels = self.extract_confidence_scores(
            non_member_loader, model=model, is_member=False
        )
        
        # Combine all data
        X_test = np.concatenate([member_scores, non_member_scores], axis=0)
        y_true = np.concatenate([member_labels, non_member_labels], axis=0)
        
        # Predict membership
        if attack_strategy == 'model_based' and self.attack_classifier is not None:
            y_pred = self.attack_classifier.predict(X_test)
            y_pred_proba = self.attack_classifier.predict_proba(X_test)[:, 1]
        else:
            # Threshold-based
            max_confidences = np.max(X_test, axis=1)
            y_pred = (max_confidences > getattr(self, 'attack_threshold', 0.5)).astype(int)
            y_pred_proba = max_confidences
        
        # Compute metrics
        accuracy = accuracy_score(y_true, y_pred)
        precision = precision_score(y_true, y_pred, zero_division=0)
        recall = recall_score(y_true, y_pred, zero_division=0)
        auc = roc_auc_score(y_true, y_pred_proba)
        
        # Quantify privacy leakage (how much better than random guessing)
        baseline_accuracy = 0.5  # Random guessing
        privacy_leakage = accuracy - baseline_accuracy
        
        # Determine severity
        if accuracy > baseline_accuracy + 0.1:
            severity = "HIGH"
        elif accuracy > baseline_accuracy + 0.05:
            severity = "MEDIUM"
        else:
            severity = "LOW"
        
        metrics = {
            'accuracy': accuracy,
            'precision': precision,
            'recall': recall,
            'auc': auc,
            'privacy_leakage': privacy_leakage,
            'leakage_severity': severity
        }
        
        self.attack_metrics = metrics
        
        logger.info(
            f"Attack Results: Accuracy={accuracy:.2%}, Precision={precision:.2%}, "
            f"Recall={recall:.2%}, AUC={auc:.4f}, Leakage={privacy_leakage:.2%} ({severity})"
        )
        
        return metrics
    
    def compare_dp_vs_non_dp(
        self,
        dp_model: nn.Module,
        non_dp_model: nn.Module,
        member_data: TensorDataset,
        non_member_data: TensorDataset,
        batch_size: int = 32
    ) -> Dict[str, Dict[str, float]]:
        """
        Compare attack success between DP and non-DP models.
        
        Evaluates the membership inference attack on both a differentially
        private model and a non-private baseline to demonstrate the
        effectiveness of DP in reducing privacy leakage.
        
        Args:
            dp_model: Differentially private model
            non_dp_model: Non-private baseline model
            member_data: Test set of member samples
            non_member_data: Test set of non-member samples
            batch_size: Batch size for data loading
        
        Returns:
            Dictionary with 'dp' and 'non_dp' keys, each containing attack metrics
        
        Requirements: 6.6
        """
        logger.info("Comparing attack success between DP and non-DP models...")
        
        # Evaluate attack on non-DP model
        logger.info("Evaluating attack on non-DP model...")
        non_dp_metrics = self.evaluate_attack(
            member_data, non_member_data, batch_size, model=non_dp_model
        )
        
        # Evaluate attack on DP model
        logger.info("Evaluating attack on DP model...")
        dp_metrics = self.evaluate_attack(
            member_data, non_member_data, batch_size, model=dp_model
        )
        
        # Compute privacy gain
        privacy_gain = non_dp_metrics['accuracy'] - dp_metrics['accuracy']
        
        comparison = {
            'non_dp': non_dp_metrics,
            'dp': dp_metrics,
            'privacy_gain': privacy_gain
        }
        
        logger.info(
            f"Comparison Results:\n"
            f"  Non-DP Attack Accuracy: {non_dp_metrics['accuracy']:.2%}\n"
            f"  DP Attack Accuracy: {dp_metrics['accuracy']:.2%}\n"
            f"  Privacy Gain: {privacy_gain:.2%}"
        )
        
        return comparison
    
    def log_attack_performance_by_privacy_budget(
        self,
        models_by_epsilon: Dict[float, nn.Module],
        member_data: TensorDataset,
        non_member_data: TensorDataset,
        batch_size: int = 32
    ) -> Dict[float, Dict[str, float]]:
        """
        Log attack performance metrics across different privacy budget levels.
        
        Evaluates the membership inference attack across multiple models trained
        with different privacy budgets (epsilon values) to demonstrate the
        privacy-utility tradeoff.
        
        Args:
            models_by_epsilon: Dictionary mapping epsilon values to trained models
            member_data: Test set of member samples
            non_member_data: Test set of non-member samples
            batch_size: Batch size for data loading
        
        Returns:
            Dictionary mapping epsilon values to attack metrics
        
        Requirements: 6.7
        """
        logger.info("Logging attack performance across privacy budget levels...")
        
        results_by_epsilon = {}
        
        for epsilon, model in sorted(models_by_epsilon.items()):
            logger.info(f"Evaluating attack for epsilon={epsilon}...")
            
            metrics = self.evaluate_attack(
                member_data, non_member_data, batch_size, model=model
            )
            
            results_by_epsilon[epsilon] = metrics
            
            logger.info(
                f"  ε={epsilon}: Accuracy={metrics['accuracy']:.2%}, "
                f"AUC={metrics['auc']:.4f}, Leakage={metrics['privacy_leakage']:.2%}"
            )
        
        return results_by_epsilon
    
    def plot_attack_performance(
        self,
        results_by_epsilon: Dict[float, Dict[str, float]],
        save_path: Optional[str] = None
    ):
        """
        Generate attack performance visualization plots.
        
        Creates comprehensive visualization showing:
        1. Attack accuracy vs privacy budget (epsilon)
        2. AUC-ROC vs privacy budget
        3. Privacy leakage severity across epsilon values
        
        Args:
            results_by_epsilon: Dictionary mapping epsilon to attack metrics
            save_path: Optional path to save the plot (PNG format)
        
        Requirements: 6.10
        """
        logger.info("Generating attack performance visualization...")
        
        # Extract data for plotting
        epsilon_values = sorted(results_by_epsilon.keys())
        accuracies = [results_by_epsilon[eps]['accuracy'] for eps in epsilon_values]
        aucs = [results_by_epsilon[eps]['auc'] for eps in epsilon_values]
        leakages = [results_by_epsilon[eps]['privacy_leakage'] for eps in epsilon_values]
        
        # Create figure with subplots
        fig, axes = plt.subplots(1, 3, figsize=(15, 4))
        
        # Plot 1: Attack Accuracy vs Epsilon
        axes[0].plot(epsilon_values, accuracies, marker='o', linewidth=2, markersize=8)
        axes[0].axhline(y=0.5, color='r', linestyle='--', label='Random Guessing')
        axes[0].set_xlabel('Privacy Budget (ε)', fontsize=12)
        axes[0].set_ylabel('Attack Accuracy', fontsize=12)
        axes[0].set_title('MIA Attack Accuracy vs Privacy Budget', fontsize=13)
        axes[0].legend()
        axes[0].grid(True, alpha=0.3)
        
        # Plot 2: AUC-ROC vs Epsilon
        axes[1].plot(epsilon_values, aucs, marker='s', linewidth=2, markersize=8, color='orange')
        axes[1].axhline(y=0.5, color='r', linestyle='--', label='Random Guessing')
        axes[1].set_xlabel('Privacy Budget (ε)', fontsize=12)
        axes[1].set_ylabel('AUC-ROC', fontsize=12)
        axes[1].set_title('MIA AUC-ROC vs Privacy Budget', fontsize=13)
        axes[1].legend()
        axes[1].grid(True, alpha=0.3)
        
        # Plot 3: Privacy Leakage vs Epsilon
        axes[2].bar(range(len(epsilon_values)), leakages, color='steelblue', alpha=0.7)
        axes[2].set_xticks(range(len(epsilon_values)))
        axes[2].set_xticklabels([f'{eps}' for eps in epsilon_values])
        axes[2].set_xlabel('Privacy Budget (ε)', fontsize=12)
        axes[2].set_ylabel('Privacy Leakage (above baseline)', fontsize=12)
        axes[2].set_title('Privacy Leakage vs Privacy Budget', fontsize=13)
        axes[2].grid(True, alpha=0.3, axis='y')
        
        # Adjust layout to prevent overlapping
        plt.tight_layout()
        
        # Save or display plot
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            logger.info(f"Plot saved to {save_path}")
        else:
            plt.show()
        
        logger.info("Attack performance visualization completed")
    
    def plot_roc_curve(
        self,
        member_data: TensorDataset,
        non_member_data: TensorDataset,
        batch_size: int = 32,
        model: Optional[nn.Module] = None,
        save_path: Optional[str] = None
    ):
        """
        Generate ROC curve for membership inference attack.
        
        Plots the Receiver Operating Characteristic (ROC) curve showing
        the tradeoff between true positive rate and false positive rate
        for membership prediction at different thresholds.
        
        Args:
            member_data: Test set of member samples
            non_member_data: Test set of non-member samples
            batch_size: Batch size for data loading
            model: Model to attack (default: target_model)
            save_path: Optional path to save the plot (PNG format)
        
        Requirements: 6.10
        """
        if model is None:
            model = self.target_model
        
        logger.info("Generating ROC curve for membership inference attack...")
        
        # Prepare data loaders
        member_loader = DataLoader(member_data, batch_size=batch_size, shuffle=False)
        non_member_loader = DataLoader(non_member_data, batch_size=batch_size, shuffle=False)
        
        # Extract confidence scores
        member_scores, member_labels = self.extract_confidence_scores(
            member_loader, model=model, is_member=True
        )
        non_member_scores, non_member_labels = self.extract_confidence_scores(
            non_member_loader, model=model, is_member=False
        )
        
        # Combine all data
        X_test = np.concatenate([member_scores, non_member_scores], axis=0)
        y_true = np.concatenate([member_labels, non_member_labels], axis=0)
        
        # Get prediction probabilities
        if self.attack_classifier is not None:
            y_pred_proba = self.attack_classifier.predict_proba(X_test)[:, 1]
        else:
            # Use max confidence as score
            y_pred_proba = np.max(X_test, axis=1)
        
        # Compute ROC curve
        fpr, tpr, thresholds = roc_curve(y_true, y_pred_proba)
        auc = roc_auc_score(y_true, y_pred_proba)
        
        # Plot ROC curve
        plt.figure(figsize=(8, 6))
        plt.plot(fpr, tpr, linewidth=2, label=f'MIA Attack (AUC = {auc:.4f})')
        plt.plot([0, 1], [0, 1], 'r--', linewidth=2, label='Random Guessing (AUC = 0.50)')
        plt.xlabel('False Positive Rate', fontsize=12)
        plt.ylabel('True Positive Rate', fontsize=12)
        plt.title('ROC Curve for Membership Inference Attack', fontsize=13)
        plt.legend(loc='lower right', fontsize=11)
        plt.grid(True, alpha=0.3)
        
        # Save or display plot
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            logger.info(f"ROC curve saved to {save_path}")
        else:
            plt.show()
        
        logger.info(f"ROC curve generated with AUC = {auc:.4f}")
    
    def get_attack_summary(self) -> Dict[str, Any]:
        """
        Get comprehensive summary of attack evaluation results.
        
        Returns:
            Dictionary containing:
            - num_shadow_models: Number of shadow models trained
            - attack_classifier_type: Type of attack classifier used
            - attack_metrics: Latest attack performance metrics
            - device: Device used for computation
        
        Requirements: 6.5, 6.7
        """
        summary = {
            'num_shadow_models': len(self.shadow_models),
            'attack_classifier_type': (
                'LogisticRegression' if self.attack_classifier is not None 
                else 'Threshold-based'
            ),
            'attack_metrics': self.attack_metrics,
            'device': str(self.device),
            'shadow_models_trained': len(self.shadow_models) > 0,
            'attack_classifier_trained': self.attack_classifier is not None
        }
        
        return summary
    
    def reset(self):
        """
        Reset the evaluator state for a new evaluation.
        
        Clears shadow models, attack classifier, and cached results
        to prepare for a new attack evaluation.
        """
        self.shadow_models = []
        self.attack_classifier = None
        self.confidence_scores = {}
        self.attack_metrics = {}
        
        logger.info("MIA Evaluator state reset")
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        return (
            f"MIAEvaluator(num_shadow_models={self.num_shadow_models}, "
            f"device={self.device}, "
            f"trained_shadows={len(self.shadow_models)}, "
            f"has_classifier={self.attack_classifier is not None})"
        )
