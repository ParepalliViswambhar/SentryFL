"""
Verification script for Task 4.2: PLMTimeSeriesBackbone Implementation

This script verifies that all task requirements are met:
- Load pre-trained BERT model from Hugging Face (bert-base-uncased)
- Implement time-series to embedding projection layer
- Add positional encoding to embeddings
- Support backbone freezing for parameter-efficient fine-tuning
- Implement forward pass with [CLS] token extraction for BERT models
- Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7
"""

import torch
import torch.nn as nn
from sentryfl.models.plm_backbone import (
    PositionalEncoding,
    PLMTimeSeriesBackbone,
    AnomalyDetectionHead,
    PLMAnomalyDetector
)
from transformers import AutoModel, AutoConfig


def verify_requirement_4_1():
    """Requirement 4.1: Load pre-trained transformer models (BERT)"""
    print("\n" + "="*80)
    print("REQUIREMENT 4.1: Load pre-trained BERT model")
    print("="*80)
    
    try:
        # Test loading bert-base-uncased
        backbone = PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='bert-base-uncased',
            freeze_backbone=True
        )
        
        print("✓ Successfully loaded bert-base-uncased model")
        print(f"  Model type: {type(backbone.transformer)}")
        print(f"  Config: {backbone.config.model_type}")
        print(f"  Hidden size: {backbone.config.hidden_size}")
        
        return True
    except Exception as e:
        print(f"✗ Failed to load BERT model: {e}")
        return False


def verify_requirement_4_2():
    """Requirement 4.2: Convert time-series windows to token sequences"""
    print("\n" + "="*80)
    print("REQUIREMENT 4.2: Convert time-series windows to embeddings")
    print("="*80)
    
    try:
        backbone = PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='bert-base-uncased',
            freeze_backbone=True
        )
        
        # Test time-series projection
        batch_size = 4
        seq_len = 100
        input_dim = 38
        
        # Create sample time-series data
        time_series = torch.randn(batch_size, seq_len, input_dim)
        
        # Project to embedding space
        embeddings = backbone.ts_projection(time_series)
        
        print(f"✓ Time-series projection layer successfully converts:")
        print(f"  Input shape: {time_series.shape} (batch, seq_len, input_dim)")
        print(f"  Output shape: {embeddings.shape} (batch, seq_len, hidden_dim)")
        print(f"  Projection: {input_dim} → {backbone.hidden_dim}")
        
        return True
    except Exception as e:
        print(f"✗ Failed time-series conversion: {e}")
        return False


def verify_requirement_4_3():
    """Requirement 4.3: Embed features into high-dimensional representations"""
    print("\n" + "="*80)
    print("REQUIREMENT 4.3: Embed features into high-dimensional representations")
    print("="*80)
    
    try:
        backbone = PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='bert-base-uncased',
            freeze_backbone=True
        )
        
        # Test embedding dimension
        time_series = torch.randn(4, 100, 38)
        representations = backbone(time_series)
        
        print(f"✓ High-dimensional embedding successful:")
        print(f"  Input dimension: 38 features")
        print(f"  Embedding dimension: {backbone.hidden_dim}")
        print(f"  Output shape: {representations.shape} (batch, hidden_dim)")
        print(f"  Dimension increase: {backbone.hidden_dim / 38:.1f}x")
        
        return True
    except Exception as e:
        print(f"✗ Failed embedding: {e}")
        return False


def verify_requirement_4_4():
    """Requirement 4.4: Apply positional encoding to preserve temporal order"""
    print("\n" + "="*80)
    print("REQUIREMENT 4.4: Apply positional encoding")
    print("="*80)
    
    try:
        # Test positional encoding module
        pe = PositionalEncoding(d_model=768, max_len=512)
        
        # Test with sample data
        x = torch.randn(4, 100, 768)
        x_with_pos = pe(x)
        
        print("✓ Positional encoding successfully applied:")
        print(f"  Input shape: {x.shape}")
        print(f"  Output shape: {x_with_pos.shape}")
        print(f"  PE buffer shape: {pe.pe.shape}")
        print(f"  Max sequence length: 512")
        
        # Verify PE is added (not identity)
        assert not torch.allclose(x, x_with_pos), "Positional encoding not applied"
        print("✓ Positional encoding modifies input (not identity)")
        
        # Test determinism with dropout=0
        pe_no_dropout = PositionalEncoding(d_model=768, max_len=512, dropout=0.0)
        out1 = pe_no_dropout(x)
        out2 = pe_no_dropout(x)
        assert torch.allclose(out1, out2), "Positional encoding not deterministic"
        print("✓ Positional encoding is deterministic")
        
        return True
    except Exception as e:
        print(f"✗ Failed positional encoding: {e}")
        return False


def verify_requirement_4_5():
    """Requirement 4.5: Pass embeddings through transformer layers"""
    print("\n" + "="*80)
    print("REQUIREMENT 4.5: Pass embeddings through transformer layers")
    print("="*80)
    
    try:
        backbone = PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='bert-base-uncased',
            freeze_backbone=True
        )
        
        # Test full forward pass through transformer
        time_series = torch.randn(4, 100, 38)
        
        # Get intermediate embeddings
        embeddings = backbone.ts_projection(time_series)
        embeddings_with_pos = backbone.positional_encoding(embeddings)
        
        # Pass through transformer
        transformer_output = backbone.transformer(inputs_embeds=embeddings_with_pos)
        
        print("✓ Transformer processing successful:")
        print(f"  Input embeddings shape: {embeddings_with_pos.shape}")
        print(f"  Transformer output shape: {transformer_output.last_hidden_state.shape}")
        print(f"  Number of transformer layers: {backbone.config.num_hidden_layers}")
        print(f"  Attention heads: {backbone.config.num_attention_heads}")
        
        return True
    except Exception as e:
        print(f"✗ Failed transformer pass: {e}")
        return False


def verify_requirement_4_6():
    """Requirement 4.6: Output contextualized representations for anomaly scoring"""
    print("\n" + "="*80)
    print("REQUIREMENT 4.6: Output contextualized representations")
    print("="*80)
    
    try:
        # Test complete model with detection head
        model = PLMAnomalyDetector(
            input_dim=38,
            model_name='bert-base-uncased',
            freeze_backbone=True
        )
        
        time_series = torch.randn(4, 100, 38)
        
        # Get representations from backbone
        representations = model.backbone(time_series)
        
        # Get anomaly scores from head
        scores = model.head(representations)
        
        print("✓ Contextualized representations for anomaly scoring:")
        print(f"  Backbone output shape: {representations.shape} (batch, hidden_dim)")
        print(f"  Anomaly scores shape: {scores.shape} (batch, 1)")
        print(f"  Sample representation norm: {representations[0].norm().item():.4f}")
        print(f"  Sample anomaly score: {scores[0].item():.4f}")
        
        return True
    except Exception as e:
        print(f"✗ Failed contextualized representations: {e}")
        return False


def verify_requirement_4_7():
    """Requirement 4.7: Support freezing backbone parameters during fine-tuning"""
    print("\n" + "="*80)
    print("REQUIREMENT 4.7: Support backbone freezing for parameter-efficient fine-tuning")
    print("="*80)
    
    try:
        # Test with frozen backbone
        backbone_frozen = PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='bert-base-uncased',
            freeze_backbone=True
        )
        
        # Test with unfrozen backbone
        backbone_unfrozen = PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='bert-base-uncased',
            freeze_backbone=False
        )
        
        # Count parameters
        frozen_trainable = backbone_frozen.get_trainable_parameters()
        frozen_total = backbone_frozen.get_total_parameters()
        
        unfrozen_trainable = backbone_unfrozen.get_trainable_parameters()
        unfrozen_total = backbone_unfrozen.get_total_parameters()
        
        print("✓ Backbone freezing support verified:")
        print(f"\n  Frozen backbone:")
        print(f"    Total parameters: {frozen_total:,}")
        print(f"    Trainable parameters: {frozen_trainable:,}")
        print(f"    Trainable percentage: {100 * frozen_trainable / frozen_total:.2f}%")
        
        print(f"\n  Unfrozen backbone:")
        print(f"    Total parameters: {unfrozen_total:,}")
        print(f"    Trainable parameters: {unfrozen_trainable:,}")
        print(f"    Trainable percentage: {100 * unfrozen_trainable / unfrozen_total:.2f}%")
        
        print(f"\n  Parameter reduction: {frozen_trainable / unfrozen_trainable:.1%} of full model")
        
        # Verify frozen parameters
        for param in backbone_frozen.transformer.parameters():
            assert not param.requires_grad, "Transformer parameter not frozen"
        print("✓ All transformer parameters are frozen when freeze_backbone=True")
        
        # Verify projection layer is trainable
        for param in backbone_frozen.ts_projection.parameters():
            assert param.requires_grad, "Projection layer not trainable"
        print("✓ Projection layer remains trainable")
        
        return True
    except Exception as e:
        print(f"✗ Failed backbone freezing: {e}")
        return False


def verify_cls_token_extraction():
    """Verify [CLS] token extraction for BERT models"""
    print("\n" + "="*80)
    print("BONUS: [CLS] token extraction for BERT models")
    print("="*80)
    
    try:
        backbone = PLMTimeSeriesBackbone(
            input_dim=38,
            model_name='bert-base-uncased',
            freeze_backbone=True
        )
        
        # Set to eval mode to disable dropout
        backbone.eval()
        
        time_series = torch.randn(4, 100, 38)
        
        with torch.no_grad():
            # Get full transformer output
            embeddings = backbone.ts_projection(time_series)
            embeddings_with_pos = backbone.positional_encoding(embeddings)
            transformer_output = backbone.transformer(inputs_embeds=embeddings_with_pos)
            
            # Extract [CLS] token (first token)
            cls_token = transformer_output.last_hidden_state[:, 0, :]
            
            # Get backbone output (should be [CLS] token)
            backbone_output = backbone(time_series)
        
        print("✓ [CLS] token extraction verified:")
        print(f"  Full sequence output shape: {transformer_output.last_hidden_state.shape}")
        print(f"  [CLS] token shape: {cls_token.shape}")
        print(f"  Backbone output shape: {backbone_output.shape}")
        
        # Verify they match (use relaxed tolerance due to positional encoding dropout)
        assert torch.allclose(cls_token, backbone_output, atol=1e-4), "[CLS] token mismatch"
        print("✓ Backbone correctly extracts [CLS] token (first position)")
        
        return True
    except Exception as e:
        print(f"✗ Failed [CLS] token extraction: {e}")
        return False


def verify_gradient_flow():
    """Verify gradient flow through trainable parameters"""
    print("\n" + "="*80)
    print("BONUS: Gradient flow verification")
    print("="*80)
    
    try:
        model = PLMAnomalyDetector(
            input_dim=38,
            model_name='bert-base-uncased',
            freeze_backbone=True
        )
        
        # Create sample data
        x = torch.randn(4, 50, 38)
        target = torch.randn(4, 1)
        
        # Forward pass
        output = model(x)
        loss = nn.MSELoss()(output, target)
        
        # Backward pass
        loss.backward()
        
        # Check gradient flow
        trainable_with_grad = 0
        trainable_without_grad = 0
        frozen_with_grad = 0
        
        for name, param in model.named_parameters():
            if param.requires_grad:
                if param.grad is not None:
                    trainable_with_grad += 1
                else:
                    trainable_without_grad += 1
            else:
                if param.grad is not None:
                    frozen_with_grad += 1
        
        print("✓ Gradient flow verification:")
        print(f"  Trainable parameters with gradients: {trainable_with_grad}")
        print(f"  Trainable parameters without gradients: {trainable_without_grad}")
        print(f"  Frozen parameters with gradients: {frozen_with_grad}")
        
        assert trainable_without_grad == 0, "Some trainable parameters lack gradients"
        print("✓ All trainable parameters have gradients")
        
        assert frozen_with_grad == 0, "Some frozen parameters have gradients"
        print("✓ No frozen parameters have gradients")
        
        return True
    except Exception as e:
        print(f"✗ Failed gradient flow: {e}")
        return False


def main():
    """Run all verification tests"""
    print("\n" + "="*80)
    print("TASK 4.2 VERIFICATION: PLMTimeSeriesBackbone Implementation")
    print("="*80)
    print("\nVerifying all task requirements...")
    
    results = {}
    
    # Core requirements
    results['4.1'] = verify_requirement_4_1()
    results['4.2'] = verify_requirement_4_2()
    results['4.3'] = verify_requirement_4_3()
    results['4.4'] = verify_requirement_4_4()
    results['4.5'] = verify_requirement_4_5()
    results['4.6'] = verify_requirement_4_6()
    results['4.7'] = verify_requirement_4_7()
    
    # Bonus verifications
    results['CLS Token'] = verify_cls_token_extraction()
    results['Gradient Flow'] = verify_gradient_flow()
    
    # Summary
    print("\n" + "="*80)
    print("VERIFICATION SUMMARY")
    print("="*80)
    
    for name, passed in results.items():
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {name}: {status}")
    
    total = len(results)
    passed = sum(results.values())
    
    print(f"\nTotal: {passed}/{total} verifications passed")
    
    if all(results.values()):
        print("\n🎉 ALL REQUIREMENTS VERIFIED SUCCESSFULLY!")
        print("\nTask 4.2 is COMPLETE:")
        print("  ✓ Load pre-trained BERT model (bert-base-uncased)")
        print("  ✓ Time-series to embedding projection layer")
        print("  ✓ Positional encoding for temporal order")
        print("  ✓ Backbone freezing for parameter efficiency")
        print("  ✓ Forward pass through transformer layers")
        print("  ✓ [CLS] token extraction for BERT models")
        print("  ✓ Contextualized representations for anomaly scoring")
        return 0
    else:
        print("\n⚠ SOME REQUIREMENTS NOT MET")
        return 1


if __name__ == "__main__":
    exit(main())
