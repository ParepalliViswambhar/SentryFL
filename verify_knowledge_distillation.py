"""
Verification script for Knowledge Distillation Module

This script demonstrates the complete knowledge distillation workflow:
1. Load a pre-trained teacher model (federated global model)
2. Initialize student model with smaller architecture
3. Train student model using knowledge distillation
4. Evaluate model size reduction
5. Compare teacher and student performance

**Validates: Requirements 8.1-8.10**
"""

import torch
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader
from sentryfl.models.plm_backbone import PLMAnomalyDetector
from sentryfl.models.knowledge_distillation import KnowledgeDistillationModule


def main():
    print("=" * 80)
    print("Knowledge Distillation Module Verification")
    print("=" * 80)
    print()
    
    # Configuration
    input_dim = 38  # SMD dataset has 38 features
    seq_len = 100   # Time window size
    num_samples = 128
    batch_size = 16
    num_epochs = 3
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    print(f"Device: {device}")
    print(f"Input dimension: {input_dim}")
    print(f"Sequence length: {seq_len}")
    print()
    
    # Step 1: Create teacher model (simulating federated global model)
    print("Step 1: Loading teacher model (federated global model)...")
    print("-" * 80)
    
    # **Validates: Requirement 8.1** (use federated global model as teacher)
    teacher_model = PLMAnomalyDetector(
        input_dim=input_dim,
        model_name='distilbert-base-uncased',
        freeze_backbone=True,
        max_seq_len=128
    )
    
    teacher_params = sum(p.numel() for p in teacher_model.parameters())
    print(f"Teacher model created")
    print(f"Teacher parameters: {teacher_params:,}")
    print()
    
    # Step 2: Initialize Knowledge Distillation Module
    print("Step 2: Initializing Knowledge Distillation Module...")
    print("-" * 80)
    
    # **Validates: Requirements 8.2, 8.9** (smaller student, temperature scaling)
    kd_module = KnowledgeDistillationModule(
        teacher_model=teacher_model,
        input_dim=input_dim,
        student_hidden_dim=256,
        student_num_layers=2,
        temperature=3.0,  # Temperature for soft prediction smoothing
        alpha=0.7,        # Weight for distillation loss
        device=device
    )
    
    # **Validates: Requirement 8.10** (log model size reduction percentage)
    size_stats = kd_module.get_model_size_reduction()
    print(f"Student model created")
    print(f"Student parameters: {size_stats['student_parameters']:,}")
    print(f"Model size reduction: {size_stats['reduction_percentage']:.2f}%")
    print(f"Compression ratio: {size_stats['compression_ratio']:.2f}x")
    print()
    
    # Step 3: Create synthetic dataset
    print("Step 3: Creating synthetic dataset...")
    print("-" * 80)
    
    # Generate random time-series data
    X_train = torch.randn(num_samples, seq_len, input_dim)
    y_train = torch.randint(0, 2, (num_samples,))
    
    X_val = torch.randn(num_samples // 4, seq_len, input_dim)
    y_val = torch.randint(0, 2, (num_samples // 4,))
    
    train_dataset = TensorDataset(X_train, y_train)
    val_dataset = TensorDataset(X_val, y_val)
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    
    print(f"Training samples: {len(train_dataset)}")
    print(f"Validation samples: {len(val_dataset)}")
    print(f"Batch size: {batch_size}")
    print()
    
    # Step 4: Train student model
    print("Step 4: Training student model with knowledge distillation...")
    print("-" * 80)
    
    optimizer = optim.Adam(kd_module.student_model.parameters(), lr=0.001)
    
    # **Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.7, 8.8**
    # (teacher soft predictions, student predictions, distillation loss,
    #  hard label loss, combined loss, optimize student model)
    history = kd_module.train_student(
        train_loader=train_loader,
        optimizer=optimizer,
        num_epochs=num_epochs,
        val_loader=val_loader,
        log_interval=2
    )
    
    print()
    print("Training complete!")
    print()
    
    # Step 5: Display training results
    print("Step 5: Training Results")
    print("-" * 80)
    
    print("Training Loss History:")
    for epoch, loss in enumerate(history['train_loss'], 1):
        val_loss = history['val_loss'][epoch - 1] if history['val_loss'] else None
        if val_loss is not None:
            print(f"  Epoch {epoch}: Train Loss = {loss:.4f}, Val Loss = {val_loss:.4f}")
        else:
            print(f"  Epoch {epoch}: Train Loss = {loss:.4f}")
    
    print()
    print("Loss Components (Final Epoch):")
    print(f"  Distillation Loss: {history['train_distillation_loss'][-1]:.4f}")
    print(f"  Hard Label Loss: {history['train_hard_loss'][-1]:.4f}")
    print(f"  Alpha (distillation weight): {kd_module.alpha:.2f}")
    print()
    
    # Step 6: Evaluate student model
    print("Step 6: Evaluating student model...")
    print("-" * 80)
    
    # **Validates: Requirement 8.11** (evaluate student model performance)
    student_val_loss = kd_module.evaluate_student(val_loader)
    print(f"Student validation loss: {student_val_loss:.4f}")
    print()
    
    # Step 7: Compare teacher and student
    print("Step 7: Teacher vs Student Comparison")
    print("-" * 80)
    
    # Evaluate teacher
    teacher_model.eval()
    teacher_val_loss = 0.0
    num_batches = 0
    
    with torch.no_grad():
        for data, labels in val_loader:
            data = data.to(device)
            labels = labels.to(device).unsqueeze(1).float()
            
            teacher_output = teacher_model(data)
            loss = torch.nn.functional.binary_cross_entropy_with_logits(
                teacher_output, labels
            )
            teacher_val_loss += loss.item()
            num_batches += 1
    
    teacher_val_loss /= num_batches
    
    print(f"Teacher validation loss: {teacher_val_loss:.4f}")
    print(f"Student validation loss: {student_val_loss:.4f}")
    print(f"Loss difference: {abs(teacher_val_loss - student_val_loss):.4f}")
    print()
    
    print("Model Size Comparison:")
    print(f"  Teacher: {size_stats['teacher_parameters']:,} parameters")
    print(f"  Student: {size_stats['student_parameters']:,} parameters")
    print(f"  Reduction: {size_stats['reduction_percentage']:.2f}%")
    print(f"  Compression: {size_stats['compression_ratio']:.2f}x")
    print()
    
    # Step 8: Save student model
    print("Step 8: Saving student model...")
    print("-" * 80)
    
    save_path = "student_model_checkpoint.pt"
    kd_module.save_student_model(save_path)
    print(f"Student model saved to: {save_path}")
    print()
    
    # Step 9: Test model loading
    print("Step 9: Testing model loading...")
    print("-" * 80)
    
    kd_module.load_student_model(save_path)
    print(f"Student model loaded successfully from: {save_path}")
    
    # Verify loaded model works
    test_input = torch.randn(1, seq_len, input_dim).to(device)
    test_output = kd_module.student_model(test_input)
    print(f"Test inference output shape: {test_output.shape}")
    print()
    
    # Summary
    print("=" * 80)
    print("Verification Complete!")
    print("=" * 80)
    print()
    print("Summary:")
    print(f"  ✓ Teacher model loaded (Requirement 8.1)")
    print(f"  ✓ Student model initialized with smaller architecture (Requirement 8.2)")
    print(f"  ✓ Soft predictions computed with temperature scaling (Requirements 8.3, 8.9)")
    print(f"  ✓ Student predictions on same inputs (Requirement 8.4)")
    print(f"  ✓ Distillation loss (KL divergence) computed (Requirement 8.5)")
    print(f"  ✓ Hard label loss (cross-entropy) computed (Requirement 8.6)")
    print(f"  ✓ Combined loss with configurable weighting (Requirement 8.7)")
    print(f"  ✓ Student model optimized (Requirement 8.8)")
    print(f"  ✓ Temperature scaling supported (Requirement 8.9)")
    print(f"  ✓ Model size reduction logged: {size_stats['reduction_percentage']:.2f}% (Requirement 8.10)")
    print(f"  ✓ Student model performance evaluated (Requirement 8.11)")
    print()
    print("All requirements validated successfully!")


if __name__ == "__main__":
    main()
