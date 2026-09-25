/**
 * NotFound (404) page
 *
 * Rendered for any authenticated route that does not match a known path. It is
 * mounted inside the Layout so the app shell (sidebar, top bar) stays around
 * it, and is built from the shared EmptyState primitive so it re-skins with the
 * light/dark theme toggle like every other surface.
 *
 * @module pages/NotFound
 */

import { Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <EmptyState
      icon={<SearchOffIcon />}
      title="Page not found"
      description="The page you're looking for doesn't exist or may have moved. Check the URL, or head back to the dashboard."
      action={
        <Button component={RouterLink} to="/" variant="contained">
          Back to dashboard
        </Button>
      }
    />
  );
}
