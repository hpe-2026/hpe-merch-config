import mongoose from 'mongoose';

/**
 * UserVerification Schema
 * Tracks alumni user registration status through the approval workflow
 */
const userVerificationSchema = new mongoose.Schema(
  {
    // Keycloak user ID (optional for MongoDB-based auth)
    user_id: {
      type: String,
      default: null,
      index: true,
    },

    // User email (indexed for quick lookup)
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    // Password hash for local authentication (MongoDB)
    password: {
      type: String,
      default: null, // Not required if using Keycloak
    },

    // User full name
    name: {
      type: String,
      required: true,
    },

    // Alumni/Student ID for verification purposes
    alumni_id: {
      type: String,
      default: '',
      trim: true,
    },

    // Department or graduation year (optional)
    department: {
      type: String,
      default: '',
      trim: true,
    },

    graduation_year: {
      type: Number,
      default: null,
    },

    // User role
    role: {
      type: String,
      enum: ['user', 'admin', 'moderator'],
      default: 'user',
    },

    // Verification status: pending, approved, rejected
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },

    // Registration timestamp
    registration_timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // Admin approval/rejection details
    approved_by: {
      type: String, // Admin name/email
      default: null,
    },

    approval_timestamp: {
      type: Date,
      default: null,
    },

    approval_reason: {
      type: String,
      default: '',
      trim: true,
    },

    rejected_by: {
      type: String, // Admin name/email
      default: null,
    },

    rejection_timestamp: {
      type: Date,
      default: null,
    },

    rejection_reason: {
      type: String,
      default: '',
      trim: true,
    },

    // Event audit trail
    events: [
      {
        type: {
          type: String,
          enum: ['registered', 'approved', 'rejected', 'resubmitted'],
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        actor: String, // Who performed the action (admin email or system)
        reason: String, // Optional reason for the event
      },
    ],

    // Correlation ID for Kafka event tracing
    correlation_id: {
      type: String,
      default: null,
      index: true,
    },

    // Metadata for future extensions
    metadata: {
      type: Map,
      of: String,
      default: new Map(),
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    collection: 'user_verifications',
  }
);

// Indexes for common queries
userVerificationSchema.index({ email: 1, status: 1 });
userVerificationSchema.index({ registration_timestamp: -1 });
userVerificationSchema.index({ status: 1, registration_timestamp: -1 });

// Pre-save middleware to maintain event history
userVerificationSchema.pre('save', function(next) {
  if (!this.isNew && this.isModified('status')) {
    // Add status change event
    const eventType =
      this.status === 'approved'
        ? 'approved'
        : this.status === 'rejected'
        ? 'rejected'
        : 'resubmitted';

    const event = {
      type: eventType,
      timestamp: new Date(),
      actor: this.approved_by || this.rejected_by || 'system',
      reason: this.approval_reason || this.rejection_reason || null,
    };

    this.events = this.events || [];
    this.events.push(event);
  }

  next();
});

// Method to approve user
userVerificationSchema.methods.approve = function(adminerEmail, reason = '') {
  this.status = 'approved';
  this.approved_by = adminerEmail;
  this.approval_timestamp = new Date();
  this.approval_reason = reason;
  return this.save();
};

// Method to reject user
userVerificationSchema.methods.reject = function(adminEmail, reason = '') {
  this.status = 'rejected';
  this.rejected_by = adminEmail;
  this.rejection_timestamp = new Date();
  this.rejection_reason = reason;
  return this.save();
};

// Static method to find unverified users with pagination
userVerificationSchema.statics.findUnverified = function(skip = 0, limit = 10, sortBy = 'registration_timestamp') {
  return this.find({ status: 'pending' })
    .sort({ [sortBy]: -1 })
    .skip(skip)
    .limit(limit);
};

// Static method to count unverified users
userVerificationSchema.statics.countUnverified = function() {
  return this.countDocuments({ status: 'pending' });
};

// Static method to get user verification stats
userVerificationSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);
};

const UserVerification = mongoose.model('UserVerification', userVerificationSchema);

export default UserVerification;
