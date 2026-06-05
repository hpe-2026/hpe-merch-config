import { useState, useRef } from 'react'
import axios from 'axios'
import {
  User as UserIcon,
  Mail,
  ShieldCheck,
  LogOut,
  Pencil,
  Check,
  X,
  Lock,
  Hash,
  Activity,
  Camera,
  Upload,
  AlertCircle,
  Store,
  ImageIcon,
} from 'lucide-react'
import { API_BASE } from '../config/api'

export default function MerchantProfile({ user, onLogout, onBack }) {
  const [userData, setUserData] = useState(user)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: user?.name || '',
    merchantName: user?.merchantName || user?.merchant?.name || '',
    phone: user?.phone || '',
    address: user?.address || '',
    description: user?.description || user?.merchant?.description || '',
  })
  const [profileImage, setProfileImage] = useState(user?.profileImage || user?.avatar || null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const fileInputRef = useRef(null)

  const auth = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  })

  const handleSave = async () => {
    try {
      // Update profile via API
      const response = await axios.put(
        `${API_BASE}/api/v1/merchants/profile`,
        {
          ...formData,
          profileImage,
        },
        auth()
      )

      const updated = { ...userData, ...formData, profileImage }
      localStorage.setItem('user', JSON.stringify(updated))
      setUserData(updated)
      setEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to save profile:', err)
    }
  }

  const handleCancel = () => {
    setFormData({
      name: userData?.name || '',
      merchantName: userData?.merchantName || userData?.merchant?.name || '',
      phone: userData?.phone || '',
      address: userData?.address || '',
      description: userData?.description || userData?.merchant?.description || '',
    })
    setEditing(false)
    setUploadError(null)
  }

  const handleImageClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file (JPEG, PNG, etc.)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image size should be less than 5MB')
      return
    }

    setUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'merchant-profile')
      formData.append('merchantId', user?.merchantId || user?.merchant?.id || '')

      const response = await axios.post(
        `${API_BASE}/api/v1/upload/profile-image`,
        formData,
        {
          ...auth(),
          headers: {
            ...auth().headers,
            'Content-Type': 'multipart/form-data',
          },
        }
      )

      if (response.data?.success && response.data?.url) {
        setProfileImage(response.data.url)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    } catch (err) {
      console.error('Upload failed:', err)
      setUploadError(err.response?.data?.message || 'Failed to upload image. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const initial = (userData?.name || userData?.email || '?').charAt(0).toUpperCase()
  const roles = userData?.roles || (userData?.role ? [userData.role] : ['merchant'])
  const merchantLabel = roles.includes('merchant-admin') ? 'Merchant Admin' : 'Merchant Partner'

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 transition"
      >
        <X className="w-4 h-4 rotate-180" />
        Back to Dashboard
      </button>

      <div className="mb-6">
        <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Merchant Account</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Merchant Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage your merchant account, store details, and profile picture.
        </p>
      </div>

      {saveSuccess && (
        <div className="mb-6 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          <Check className="w-4 h-4 flex-shrink-0" />
          Profile updated successfully!
        </div>
      )}

      {uploadError && (
        <div className="mb-6 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {uploadError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Identity card with profile image */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 lg:sticky lg:top-32 self-start">
          <div className="flex flex-col items-center text-center">
            {/* Profile Image Upload */}
            <div className="relative mb-4">
              <div
                onClick={handleImageClick}
                className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold cursor-pointer transition overflow-hidden ${
                  profileImage
                    ? 'bg-cover bg-center'
                    : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white'
                } ${uploading ? 'opacity-70' : 'hover:ring-4 hover:ring-indigo-100'}`}
                style={profileImage ? { backgroundImage: `url(${profileImage})` } : {}}
              >
                {!profileImage && initial}
                
                {/* Camera overlay */}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                  <Camera className="w-6 h-6 text-white" />
                </div>
                
                {/* Upload indicator */}
                {uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              
              {/* Edit button */}
              <button
                onClick={handleImageClick}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-600 hover:text-indigo-600 hover:border-indigo-300 transition shadow-sm"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <p className="font-semibold text-slate-900">{userData?.name || 'Merchant'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{userData?.email}</p>
            
            <div className="mt-3 flex flex-wrap justify-center gap-1">
              {roles.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 capitalize"
                >
                  <ShieldCheck className="w-3 h-3" />
                  {r.replace(/-/g, ' ')}
                </span>
              ))}
            </div>

            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
              <Store className="w-3 h-3" />
              {merchantLabel}
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Merchant ID</span>
              <span className="font-mono text-slate-700">
                {(userData?.merchantId || userData?.merchant?.id || '—').toString().slice(-8)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Auth source</span>
              <span className="font-medium text-slate-900">Keycloak / JWT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Storage</span>
              <span className="font-medium text-slate-900">MinIO S3</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Session</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                <Activity className="w-3 h-3" />
                Active
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>

        {/* Details Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account Information */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Account Information</h2>
                <p className="text-xs text-slate-500">Your personal and contact details</p>
              </div>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancel}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
                  >
                    <Check className="w-4 h-4" />
                    Save
                  </button>
                </div>
              )}
            </header>

            <div className="p-6 space-y-4">
              {/* Name */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-slate-400" />
                  Full Name
                </label>
                <div className="sm:col-span-2">
                  {editing ? (
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Your full name"
                    />
                  ) : (
                    <p className="text-sm text-slate-900">{userData?.name || '—'}</p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  Email
                </label>
                <div className="sm:col-span-2">
                  <p className="text-sm text-slate-900">{userData?.email}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Contact admin to change email</p>
                </div>
              </div>

              {/* Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Hash className="w-4 h-4 text-slate-400" />
                  Phone
                </label>
                <div className="sm:col-span-2">
                  {editing ? (
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="+91 98765 43210"
                    />
                  ) : (
                    <p className="text-sm text-slate-900">{userData?.phone || '—'}</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Store Information */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <header className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Store className="w-4 h-4 text-slate-400" />
                Store Information
              </h2>
              <p className="text-xs text-slate-500">Your store details visible to customers</p>
            </header>

            <div className="p-6 space-y-4">
              {/* Store Name */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <label className="text-sm font-medium text-slate-700">Store Name</label>
                <div className="sm:col-span-2">
                  {editing ? (
                    <input
                      type="text"
                      value={formData.merchantName}
                      onChange={(e) => setFormData({ ...formData, merchantName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Your store name"
                    />
                  ) : (
                    <p className="text-sm text-slate-900">{formData.merchantName || '—'}</p>
                  )}
                </div>
              </div>

              {/* Store Description */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <div className="sm:col-span-2">
                  {editing ? (
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      placeholder="Brief description of your store..."
                    />
                  ) : (
                    <p className="text-sm text-slate-900">{formData.description || '—'}</p>
                  )}
                </div>
              </div>

              {/* Address */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                <label className="text-sm font-medium text-slate-700">Address</label>
                <div className="sm:col-span-2">
                  {editing ? (
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      placeholder="Business address"
                    />
                  ) : (
                    <p className="text-sm text-slate-900">{formData.address || '—'}</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Security Note */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-slate-900">Security</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Your profile picture is securely stored in MinIO S3-compatible storage.
                  All data is encrypted in transit and at rest.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
