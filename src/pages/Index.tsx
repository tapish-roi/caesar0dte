import { Navigate } from "react-router-dom";

// Index just redirects — App.tsx handles role-based routing
export default function Index() {
  return <Navigate to="/" replace />;
}
