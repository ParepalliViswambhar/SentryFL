"""
Verification script for VisualizationDashboard module.

This script performs comprehensive verification of the visualization module:
1. Import verification
2. Initialization tests
3. Individual plot generation
4. Vector graphics export
5. Data schema validation
"""

import sys
import numpy as np
from pathlib import Path
from sentryfl.visualization import VisualizationDashboard


def verify_imports():
    """Verify all necessary imports work."""
    print("=" * 70)
    print("VERIFICATION STEP 1: Import Verification")
    print("=" * 70)
    
    try:
        from sentryfl.visualization import VisualizationDashboard
        print("✓ VisualizationDashboard imported successfully")
        
        import matplotlib
        print(f"✓ matplotlib version: {matplotlib.__version__}")
        
        import seaborn
        print(f"✓ seaborn version: {seaborn.__version__}")
        
        return True
    except Exception as e:
        print(f"✗ Import failed: {e}")
        return False


def verify_initialization():
    """Verify dashboard initialization."""
    print("\n" + "=" * 70)
    print("VERIFICATION STEP 2: Initialization Tests")
    print("=" * 70)
    
    try:
        # Test default initialization
        dashboard1 = VisualizationDashboard()
        print(f"✓ Default initialization: {dashboard1.output_dir}")
        
        # Test custom initialization
        dashboard2 = VisualizationDashboard(
            output_dir="test_output",
            figure_format="pdf"
        )
        print(f"✓ Custom initialization: {dashboard2.output_dir}, format: {dashboard2.figure_format}")
        
        # Test invalid format handling
        try:
            dashboard3 = VisualizationDashboard(figure_format="invalid")
            print("✗ Should have raised ValueError for invalid format")
            return False
        except ValueError:
            print("✓ Invalid format correctly rejected")
        
        return True
    except Exception as e:
        print(f"✗ Initialization failed: {e}")
        return False


def verify_plot_generation():
    """Verify individual plot generation."""
    print("\n" + "=" * 70)
    print("VERIFICATION STEP 3: Plot Generation Tests")
    print("=" * 70)
    
    dashboard = VisualizationDashboard(output_dir="verify_plots", figure_format="png")
    
    tests_passed = 0
    tests_total = 10
    
    # Test 1: Training loss per client
    try:
        client_losses = {"client_1": [0.5, 0.4], "client_2": [0.6, 0.5]}
        path = dashboard.plot_training_loss_per_client(client_losses)
        assert Path(path).exists()
        print(f"✓ Test 1/10: Training loss per client")
        tests_passed += 1
    except Exception as e:
        print(f"✗ Test 1/10 failed: {e}")
    
    # Test 2: Global model convergence
    try:
        train_losses = [0.5, 0.4, 0.3]
        val_losses = [0.55, 0.45, 0.35]
        path = dashboard.plot_global_model_convergence(train_losses, val_losses)
        assert Path(path).exists()
        print(f"✓ Test 2/10: Global model convergence")
        tests_passed += 1
    except Exception as e:
        print(f"✗ Test 2/10 failed: {e}")
    
    # Test 3: Privacy budget consumption
    try:
        epsilon_values = [0.1, 0.2, 0.3]
        path = dashboard.plot_privacy_budget_consumption(epsilon_values, target_epsilon=1.0)
        assert Path(path).exists()
        print(f"✓ Test 3/10: Privacy budget consumption")
        tests_passed += 1
    except Exception as e:
        print(f"✗ Test 3/10 failed: {e}")
    
    # Test 4: Communication cost vs clients
    try:
        client_counts = [5, 20, 50]
        comm_costs = [10.5, 42.0, 105.0]
        path = dashboard.plot_communication_cost_vs_clients(client_counts, comm_costs)
        assert Path(path).exists()
        print(f"✓ Test 4/10: Communication cost vs clients")
        tests_passed += 1
    except Exception as e:
        print(f"✗ Test 4/10 failed: {e}")
    
    # Test 5: ROC curve
    try:
        fpr = np.array([0.0, 0.1, 1.0])
        tpr = np.array([0.0, 0.9, 1.0])
        path = dashboard.plot_roc_curve(fpr, tpr, 0.95)
        assert Path(path).exists()
        print(f"✓ Test 5/10: ROC curve")
        tests_passed += 1
    except Exception as e:
        print(f"✗ Test 5/10 failed: {e}")
    
    # Test 6: Precision-Recall curve
    try:
        precision = np.array([1.0, 0.9, 0.8])
        recall = np.array([0.0, 0.5, 1.0])
        path = dashboard.plot_precision_recall_curve(precision, recall, 0.89)
        assert Path(path).exists()
        print(f"✓ Test 6/10: Precision-Recall curve")
        tests_passed += 1
    except Exception as e:
        print(f"✗ Test 6/10 failed: {e}")
    
    # Test 7: Time-series with anomalies
    try:
        time_series = np.random.randn(100)
        true_labels = np.zeros(100)
        predicted_labels = np.zeros(100)
        path = dashboard.plot_time_series_with_anomalies(time_series, true_labels, predicted_labels)
        assert Path(path).exists()
        print(f"✓ Test 7/10: Time-series with anomalies")
        tests_passed += 1
    except Exception as e:
        print(f"✗ Test 7/10 failed: {e}")
    
    # Test 8: MIA attack success rate
    try:
        privacy_budgets = [0.1, 1.0, 10.0]
        attack_rates = [0.52, 0.65, 0.85]
        path = dashboard.plot_mia_attack_success_rate(privacy_budgets, attack_rates)
        assert Path(path).exists()
        print(f"✓ Test 8/10: MIA attack success rate")
        tests_passed += 1
    except Exception as e:
        print(f"✗ Test 8/10 failed: {e}")
    
    # Test 9: Model size comparison
    try:
        model_names = ["Full", "Quantized"]
        model_sizes = [150.0, 37.5]
        path = dashboard.plot_model_size_comparison(model_names, model_sizes)
        assert Path(path).exists()
        print(f"✓ Test 9/10: Model size comparison")
        tests_passed += 1
    except Exception as e:
        print(f"✗ Test 9/10 failed: {e}")
    
    # Test 10: Ablation study comparison
    try:
        configs = ["Full", "No ADMS"]
        metrics = {"F1": [0.90, 0.85]}
        path = dashboard.plot_ablation_study_comparison(configs, metrics)
        assert Path(path).exists()
        print(f"✓ Test 10/10: Ablation study comparison")
        tests_passed += 1
    except Exception as e:
        print(f"✗ Test 10/10 failed: {e}")
    
    print(f"\nPlot Generation: {tests_passed}/{tests_total} tests passed")
    return tests_passed == tests_total


def verify_vector_export():
    """Verify vector graphics export."""
    print("\n" + "=" * 70)
    print("VERIFICATION STEP 4: Vector Graphics Export")
    print("=" * 70)
    
    dashboard = VisualizationDashboard(output_dir="verify_vector", figure_format="png")
    
    data = {
        "train_losses": [0.5, 0.4, 0.3],
        "fpr": np.array([0.0, 0.5, 1.0]),
        "tpr": np.array([0.0, 0.9, 1.0]),
        "roc_auc": 0.95
    }
    
    try:
        # Test PDF export
        pdf_files = dashboard.export_all_figures_vector(data, vector_format="pdf")
        assert len(pdf_files) > 0
        assert all(Path(f).exists() for f in pdf_files)
        print(f"✓ PDF export: {len(pdf_files)} files generated")
        
        # Test SVG export
        svg_files = dashboard.export_all_figures_vector(data, vector_format="svg")
        assert len(svg_files) > 0
        assert all(Path(f).exists() for f in svg_files)
        print(f"✓ SVG export: {len(svg_files)} files generated")
        
        # Verify format restoration
        assert dashboard.figure_format == "png"
        print("✓ Figure format correctly restored after export")
        
        return True
    except Exception as e:
        print(f"✗ Vector export failed: {e}")
        return False


def verify_data_schema():
    """Verify data schema generation."""
    print("\n" + "=" * 70)
    print("VERIFICATION STEP 5: Data Schema Validation")
    print("=" * 70)
    
    dashboard = VisualizationDashboard()
    
    try:
        schema = dashboard.generate_visualization_data_export()
        
        # Verify required keys
        required_keys = [
            "experiment_id", "timestamp", "training_metrics",
            "privacy_metrics", "communication_metrics", "evaluation_metrics",
            "anomaly_detection", "model_comparison", "ablation_study"
        ]
        
        for key in required_keys:
            assert key in schema
            print(f"✓ Schema contains '{key}'")
        
        # Verify nested structure
        assert "client_losses" in schema["training_metrics"]
        assert "epsilon_values" in schema["privacy_metrics"]
        assert "client_counts" in schema["communication_metrics"]
        print("✓ Nested schema structure validated")
        
        return True
    except Exception as e:
        print(f"✗ Schema validation failed: {e}")
        return False


def main():
    """Run all verification tests."""
    print("\n" + "╔" + "═" * 68 + "╗")
    print("║" + " " * 15 + "VisualizationDashboard Verification" + " " * 18 + "║")
    print("╚" + "═" * 68 + "╝\n")
    
    results = {
        "Imports": verify_imports(),
        "Initialization": verify_initialization(),
        "Plot Generation": verify_plot_generation(),
        "Vector Export": verify_vector_export(),
        "Data Schema": verify_data_schema()
    }
    
    # Summary
    print("\n" + "=" * 70)
    print("VERIFICATION SUMMARY")
    print("=" * 70)
    
    for test_name, passed in results.items():
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{test_name:<30} {status}")
    
    all_passed = all(results.values())
    
    print("=" * 70)
    if all_passed:
        print("🎉 ALL VERIFICATIONS PASSED")
        print("=" * 70)
        return 0
    else:
        print("❌ SOME VERIFICATIONS FAILED")
        print("=" * 70)
        return 1


if __name__ == "__main__":
    sys.exit(main())
