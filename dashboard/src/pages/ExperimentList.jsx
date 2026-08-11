/**
 * Experiment List Page Component
 * 
 * Lists all experiments with status, progress, and control actions
 */

import { Box, Typography, Paper } from '@mui/material';

const ExperimentList = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Experiments
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        View and manage all federated learning experiments
      </Typography>
      
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="body1" color="text.secondary">
          Experiment list table will be implemented here.
        </Typography>
      </Paper>
    </Box>
  );
};

export default ExperimentList;
