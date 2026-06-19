import mongoose from 'mongoose';

/**
 * User Schema
 * Unified collection for all users: alumni, admins, merchants, internal staff
 * Replaces the old user_verifications collection
 */
const userSchema = new mongoose.Schema(
  {
    // Keycloak user ID
    user_id: {
      type: String,
      default: null,
      index: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    // Password hash for local authentication (MongoDB-based signup)
    password: {
      type: String,
      default: null,
    },

    name: {
      type: String,
      required: true,
    },

    // Alumni/Student ID
    alumni_id: {
      type: String,
      default: '',
      trim: true,
    },

    department: {
      type: String,
      default: '',
      trim: true,
    },

    graduation_year: {
      type: Number,
      default: null,
    },

    // User type: alumni, non_alumni, admin, merchant, internal
    user_type: {
      type: String,
      enum: ['alumni', 'non_alumni', 'admin', 'merchant', 'internal'],
      default: 'alumni',
    },

    // Merchant ID for merchant users
    merchant_id: {
      type: String,
      default: null,
      index: true,
    },

    // Status: pending (awaiting approval), approved, rejected
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },

    // Profile fields
    profileImage: { type: String, default: null },
    merchantName: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null },
    description: { type: String, default: null },

    // Registration & approval
    registration_timestamp: { type: Date, default: Date.now, index: true },
    approved_by: { type: String, default: null },
    approval_timestamp: { type: Date, default: null },
    approval_reason: { type: String, default: '', trim: true },
    rejected_by: { type: String, default: null },
    rejection_timestamp: { type: Date, default: null },
    rejection_reason: { type: String, default: '', trim: true },

    // Event audit trail
    events: [
      {
        type: { type: String, enum: ['registered', 'approved', 'rejected', 'resubmitted'] },
        timestamp: { type: Date, default: Date.now },
        actor: String,
        reason: String,
      },
    ],

    // Correlation ID for Kafka event tracing
    correlation_id: { type: String, default: null, index: true },

    // Email verification
    email_verified: { type: Boolean, default: false },
    email_verification_token: { type: String, default: null, index: true },
    email_verification_sent_at: { type: Date, default: null },
    email_verified_at: { type: Date, default: null },

    // Metadata
    metadata: { type: Map, of: String, default: new Map() },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

// Indexes
userSchema.index({ email: 1, status: 1 });
userSchema.index({ user_type: 1 });
userSchema.index({ status: 1, registration_timestamp: -1 });

// Pre-save: track status changes
userSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified('status')) {
    const eventType =
      this.status === 'approved' ? 'approved' :
      this.status === 'rejected' ? 'rejected' : 'resubmitted';
    this.events = this.events || [];
    this.events.push({
      type: eventType,
      timestamp: new Date(),
      actor: this.approved_by || this.rejected_by || 'system',
      reason: this.approval_reason || this.rejection_reason || null,
    });
  }
  next();
});

// Methods
userSchema.methods.approve = function (adminEmail, reason = '') {
  this.status = 'approved';
  this.approved_by = adminEmail;
  this.approval_timestamp = new Date();
  this.approval_reason = reason;
  return this.save();
};

userSchema.methods.reject = function (adminEmail, reason = '') {
  this.status = 'rejected';
  this.rejected_by = adminEmail;
  this.rejection_timestamp = new Date();
  this.rejection_reason = reason;
  return this.save();
};

// Statics
userSchema.statics.findPending = function (skip = 0, limit = 10) {
  return this.find({ status: 'pending' }).sort({ registration_timestamp: -1 }).skip(skip).limit(limit);
};

userSchema.statics.countPending = function () {
  return this.countDocuments({ status: 'pending' });
};

userSchema.statics.getStats = function () {
  return this.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
};

const User = mongoose.model('User', userSchema);

export default User;
