/**
 * Dashboard Page Component
 * 
 * Main dashboard showing experiment overview and key metrics
 */

import { Box, Typography, Grid, Paper } from '@mui/material';

const Dashboard = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Overview of federated learning experiments and system status
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" color="text.secondary">
              Active Experiments
            </Typography>
            <Typography variant="h3">0</Typography>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" color="text.secondary">
              Completed
            </Typography>
            <Typography variant="h3">0</Typography>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" color="text.secondary">
              Total Experiments
            </Typography>
            <Typography variant="h3">0</Typography>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" color="text.secondary">
              System Status
            </Typography>
            <Typography variant="h3" color="success.main">●</Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
