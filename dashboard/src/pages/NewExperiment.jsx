/**
 * New Experiment Page Component
 * 
 * Form for creating and configuring new federated learning experiments
 */

import { Box, Typography, Paper } from '@mui/material';

const NewExperiment = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Create New Experiment
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Configure and start a new federated learning training experiment
      </Typography>
      
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="body1" color="text.secondary">
          Experiment configuration form will be implemented here.
        </Typography>
      </Paper>
    </Box>
  );
};

export default NewExperiment;
