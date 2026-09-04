"""
Verification script for Task 4.1: PositionalEncoding Module Implementation

This script verifies that the PositionalEncoding module:
1. Implements sinusoidal positional encoding for temporal sequences
2. Supports configurable maximum sequence length
3. Validates Requirement 4.4: PLM_Backbone SHALL apply positional encoding to preserve temporal order
"""

import torch
import math
from sentryfl.models.plm_backbone import PositionalEncoding


def verify_sinusoidal_pattern():
    """Verify that the encoding follows sinusoidal pattern PE(pos, 2i) = sin(...), PE(pos, 2i+1) = cos(...)"""
    print("=" * 80)
    print("TEST 1: Verify Sinusoidal Pattern")
    print("=" * 80)
    
    d_model = 64
    max_len = 100
    pe_module = PositionalEncoding(d_model=d_model, max_len=max_len, dropout=0.0)
    
    # Extract the positional encoding matrix
    pe = pe_module.pe  # Shape: [max_len, d_model]
    
    # Manually compute expected values for first position (pos=0)
    position = 0
    div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
    
    expected_sin = torch.sin(torch.tensor([position], dtype=torch.float) * div_term[0])
    expected_cos = torch.cos(torch.tensor([position], dtype=torch.float) * div_term[0])
    
    actual_sin = pe[position, 0]
    actual_cos = pe[position, 1]
    
    print(f"Position 0, Index 0 (sin): Expected={expected_sin.item():.6f}, Actual={actual_sin.item():.6f}")
    print(f"Position 0, Index 1 (cos): Expected={expected_cos.item():.6f}, Actual={actual_cos.item():.6f}")
    
    assert torch.allclose(actual_sin, expected_sin, atol=1e-5), "Sin values don't match!"
    assert torch.allclose(actual_cos, expected_cos, atol=1e-5), "Cos values don't match!"
    
    print("✓ Sinusoidal pattern verified!")
    print()


def verify_configurable_max_length():
    """Verify that maximum sequence length is configurable"""
    print("=" * 80)
    print("TEST 2: Verify Configurable Maximum Sequence Length")
    print("=" * 80)
    
    test_cases = [128, 256, 512, 1024]
    
    for max_len in test_cases:
        pe_module = PositionalEncoding(d_model=768, max_len=max_len)
        
        # Check buffer shape
        assert pe_module.pe.shape[0] == max_len, f"Max length {max_len} not configured correctly!"
        print(f"✓ Max length {max_len}: Buffer shape = {pe_module.pe.shape}")
    
    print("✓ Configurable maximum sequence length verified!")
    print()


def verify_forward_pass():
    """Verify that forward pass adds positional encoding correctly"""
    print("=" * 80)
    print("TEST 3: Verify Forward Pass Adds Positional Encoding")
    print("=" * 80)
    
    batch_size = 4
    seq_len = 50
    d_model = 768
    
    pe_module = PositionalEncoding(d_model=d_model, max_len=512, dropout=0.0)
    
    # Create input tensor (zeros for easy verification)
    x = torch.zeros(batch_size, seq_len, d_model)
    
    # Forward pass
    output = pe_module(x)
    
    # With zero input and no dropout, output should equal positional encoding
    expected = pe_module.pe[:seq_len, :].unsqueeze(0).expand(batch_size, -1, -1)
    
    print(f"Input shape: {x.shape}")
    print(f"Output shape: {output.shape}")
    print(f"Expected shape: {expected.shape}")
    
    assert output.shape == (batch_size, seq_len, d_model), "Output shape incorrect!"
    assert torch.allclose(output, expected, atol=1e-5), "Positional encoding not added correctly!"
    
    print("✓ Forward pass correctly adds positional encoding!")
    print()


def verify_registered_as_buffer():
    """Verify that positional encodings are registered as buffer (not trainable)"""
    print("=" * 80)
    print("TEST 4: Verify Positional Encoding Registered as Buffer (Not Trainable)")
    print("=" * 80)
    
    pe_module = PositionalEncoding(d_model=768, max_len=512)
    
    # Check that 'pe' is in buffers
    buffer_names = [name for name, _ in pe_module.named_buffers()]
    print(f"Buffers: {buffer_names}")
    assert 'pe' in buffer_names, "Positional encoding not registered as buffer!"
    
    # Check that 'pe' is not in parameters
    param_names = [name for name, _ in pe_module.named_parameters() if 'dropout' not in name]
    print(f"Parameters (excluding dropout): {param_names}")
    assert 'pe' not in param_names, "Positional encoding should not be a trainable parameter!"
    
    # Verify pe does not require gradients
    assert not pe_module.pe.requires_grad, "Positional encoding should not require gradients!"
    
    print("✓ Positional encoding correctly registered as buffer (non-trainable)!")
    print()


def verify_temporal_order_preservation():
    """Verify that positional encoding preserves temporal order (Requirement 4.4)"""
    print("=" * 80)
    print("TEST 5: Verify Temporal Order Preservation (Requirement 4.4)")
    print("=" * 80)
    
    d_model = 768
    max_len = 512
    pe_module = PositionalEncoding(d_model=d_model, max_len=max_len, dropout=0.0)
    
    # Get positional encodings for consecutive positions
    pe = pe_module.pe
    
    # Verify that encodings for different positions are different
    for i in range(5):
        for j in range(i+1, 6):
            pos_i = pe[i]
            pos_j = pe[j]
            
            # Encodings should be different for different positions
            assert not torch.allclose(pos_i, pos_j, atol=1e-4), \
                f"Positions {i} and {j} have identical encodings!"
    
    print("✓ Different positions have unique encodings")
    
    # Verify smooth variation (neighboring positions should be similar but distinct)
    similarity_scores = []
    for i in range(10):
        pos_i = pe[i]
        pos_i_next = pe[i+1]
        
        # Compute cosine similarity
        similarity = torch.nn.functional.cosine_similarity(
            pos_i.unsqueeze(0), 
            pos_i_next.unsqueeze(0)
        ).item()
        similarity_scores.append(similarity)
    
    avg_similarity = sum(similarity_scores) / len(similarity_scores)
    print(f"✓ Average cosine similarity between consecutive positions: {avg_similarity:.4f}")
    print(f"  (High similarity indicates smooth temporal progression)")
    
    assert avg_similarity > 0.95, "Consecutive positions should have high similarity!"
    
    print("✓ Temporal order preservation verified (Requirement 4.4)!")
    print()


def verify_shape_correctness():
    """Verify shape correctness for various input dimensions"""
    print("=" * 80)
    print("TEST 6: Verify Shape Correctness for Various Input Dimensions")
    print("=" * 80)
    
    test_cases = [
        (2, 50, 256),   # (batch, seq_len, d_model)
        (8, 100, 512),
        (16, 200, 768),
        (1, 512, 1024),
    ]
    
    for batch_size, seq_len, d_model in test_cases:
        pe_module = PositionalEncoding(d_model=d_model, max_len=seq_len, dropout=0.0)
        x = torch.randn(batch_size, seq_len, d_model)
        output = pe_module(x)
        
        assert output.shape == (batch_size, seq_len, d_model), \
            f"Shape mismatch for ({batch_size}, {seq_len}, {d_model})"
        
        print(f"✓ Shape correct for input {x.shape} -> output {output.shape}")
    
    print("✓ Shape correctness verified for all test cases!")
    print()


def verify_values_in_range():
    """Verify positional encoding values are within expected range [-2, 2]"""
    print("=" * 80)
    print("TEST 7: Verify Positional Encoding Values Within Expected Range")
    print("=" * 80)
    
    pe_module = PositionalEncoding(d_model=768, max_len=512, dropout=0.0)
    pe = pe_module.pe
    
    min_val = pe.min().item()
    max_val = pe.max().item()
    
    print(f"Min value: {min_val:.6f}")
    print(f"Max value: {max_val:.6f}")
    
    # Since we're using sin and cos, values should be in [-1, 1]
    # With addition in forward pass, final values could be in [-2, 2] theoretically
    assert min_val >= -1.0 and max_val <= 1.0, \
        "Positional encoding values out of expected range!"
    
    print("✓ Positional encoding values within expected range [-1, 1]!")
    print()


def main():
    """Run all verification tests"""
    print("\n" + "=" * 80)
    print("TASK 4.1: PositionalEncoding Module Verification")
    print("=" * 80)
    print()
    
    try:
        verify_sinusoidal_pattern()
        verify_configurable_max_length()
        verify_forward_pass()
        verify_registered_as_buffer()
        verify_temporal_order_preservation()
        verify_shape_correctness()
        verify_values_in_range()
        
        print("\n" + "=" * 80)
        print("ALL TESTS PASSED! ✓")
        print("=" * 80)
        print("\nTask 4.1 Requirements Verification:")
        print("✓ Implements sinusoidal positional encoding for temporal sequences")
        print("✓ Supports configurable maximum sequence length")
        print("✓ Validates Requirement 4.4: Positional encoding preserves temporal order")
        print("✓ Forward pass produces correct output shape")
        print("✓ Positional encodings registered as buffer (non-trainable)")
        print("✓ Values within expected range")
        print("=" * 80)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        raise


if __name__ == "__main__":
    main()
