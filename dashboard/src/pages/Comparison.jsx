/**
 * Comparison Page Component
 * 
 * Compare metrics and results across multiple experiments
 */

import { Box, Typography, Paper } from '@mui/material';

const Comparison = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Experiment Comparison
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Compare performance metrics across multiple experiments
      </Typography>
      
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="body1" color="text.secondary">
          Experiment comparison interface will be implemented here.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Comparison;
