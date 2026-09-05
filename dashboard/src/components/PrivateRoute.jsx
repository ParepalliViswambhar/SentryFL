/**
 * PrivateRoute Component
 * 
 * Authentication guard that redirects to login if no auth token is present
 */

import { Navigate, useLocation } from 'react-router-dom';
import { isTokenExpired } from '../utils/tokenUtils';

/**
 * PrivateRoute wrapper component
 * Checks for authentication token and redirects to login if not present
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render if authenticated
 * @returns {React.ReactNode} - Children if authenticated, otherwise Navigate to login
 */
const PrivateRoute = ({ children }) => {
  const location = useLocation();
  const authToken = localStorage.getItem('authToken');
  const tokenIsExpired = authToken?.split('.').length === 3 && isTokenExpired(authToken);

  if (tokenIsExpired) {
    localStorage.removeItem('authToken');
  }
  
  if (!authToken || tokenIsExpired) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // If authenticated, render children
  return children;
};

export default PrivateRoute;
