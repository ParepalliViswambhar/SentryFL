/**
 * PrivateRoute Component
 * 
 * Authentication guard that redirects to login if no auth token is present
 */

import { Navigate } from 'react-router-dom';

/**
 * PrivateRoute wrapper component
 * Checks for authentication token and redirects to login if not present
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render if authenticated
 * @returns {React.ReactNode} - Children if authenticated, otherwise Navigate to login
 */
const PrivateRoute = ({ children }) => {
  // Check for authentication token in localStorage
  const authToken = localStorage.getItem('authToken');
  
  // If no token, redirect to login page
  if (!authToken) {
    return <Navigate to="/login" replace />;
  }
  
  // If authenticated, render children
  return children;
};

export default PrivateRoute;
