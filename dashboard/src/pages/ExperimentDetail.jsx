/**
 * Experiment Detail Page Component
 * 
 * Detailed view of a single experiment with metrics, visualizations, and controls
 */

import { useParams } from 'react-router-dom';
import { Box, Typography, Paper } from '@mui/material';

const ExperimentDetail = () => {
  const { id } = useParams();
  
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Experiment Details
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Viewing experiment: {id}
      </Typography>
      
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="body1" color="text.secondary">
          Experiment details, metrics, and visualizations will be implemented here.
        </Typography>
      </Paper>
    </Box>
  );
};

export default ExperimentDetail;
