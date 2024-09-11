const db = require("../models");
const jwt = require('jsonwebtoken');
// const model = db.model;

const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Get the token from the Authorization header

  if (!token) {
    return res.status(403).json({
      success: false,
      statusCode: 403,
      message: 'Authentication token is missing',
    });
  }

  // Verify the token
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        message: 'Invalid or expired token',
      });
    }

    req.user = user;
    next();
  });
};

const authorizeRole = (roles) => {
  return (req, res, next) => {
    const userRole = req.user.role;

    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        message: 'Access forbidden: Insufficient permissions',
      });
    }

    next(); // Continue to the next middleware or route handler
  };
};

const verify = {
  authenticateJWT: authenticateJWT,
  authorizeRole: authorizeRole,
};

module.exports = verify;