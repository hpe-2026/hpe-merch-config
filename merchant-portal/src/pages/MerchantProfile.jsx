import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { 
  User, 
  Mail, 
  Store, 
  Phone, 
  MapPin, 
  Camera, 
  Loader2, 
  Check, 
  AlertCircle,
  LogOut,
  Shield
} from 'lucide-react'
import { API_BASE, auth, authUpload } from '../config/api'

export default function MerchantProfile({ user, onLogout }) {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [profileImage, setProfileImage] = useState(user?.profileImage || user?.avatar || null)
  const [uploadingImage, setUploadingImage] = useState(false)
  
  const [formData, setFormData] = useState({
    name: user?.name || '',
    merchantName: user?.merchantName || user?.merchant?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || '',
    description: user?.description || user?.merchant?.description || '',
  })

  const fileInputRef = useRef(null)

  // Fetch latest profile from backend on mount to ensure profileImage persists across refreshes
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/v1/merchants/profile`, auth())
        if (response.data?.success && response.data?.data) {
          const data = response.data.data
          if (data.profileImage) {
            setProfileImage(data.profileImage)
          }
          // Sync localStorage with DB state
          const storedUser = JSON.parse(localStorage.getItem('merchant_user') || '{}')
          const updated = { ...storedUser, profileImage: data.profileImage || storedUser.profileImage }
          localStorage.setItem('merchant_user', JSON.stringify(updated))
        }
      } catch (err) {
        console.debug('Could not fetch merchant profile:', err.message)
      }
    }
    fetchProfile()
  }, [])

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size should be less than 5MB')
      return
    }

    setUploadingImage(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'merchant-profile')
      formData.append('merchantId', user?.merchantId || user?.merchant?.id || '')

      const response = await axios.post(
        `${API_BASE}/api/v1/upload/profile-image`,
        formData,
        authUpload()
      )

      if (response.data?.success && response.data?.url) {
        setProfileImage(response.data.url)
        // Persist to localStorage immediately so it survives page refresh
        const storedUser = JSON.parse(localStorage.getItem('merchant_user') || '{}')
        storedUser.profileImage = response.data.url
        localStorage.setItem('merchant_user', JSON.stringify(storedUser))
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload image')
    } finally {
      setUploadingImage(false)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    setError(null)

    try {
      await axios.put(
        `${API_BASE}/api/v1/merchants/profile`,
        { ...formData, profileImage },
        auth()
      )

      // Update local storage
      const updatedUser = { ...user, ...formData, profileImage }
      localStorage.setItem('merchant_user', JSON.stringify(updatedUser))

      setSuccess(true)
      setEditing(false)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save profile')
    } finally {
      setLoading(false)
    }
  }

  const merchantRole = user?.roles?.find(r => 
    ['merchant-admin', 'merchant-staff', 'merchant'].includes(r)
  ) || 'merchant'

  const initial = (formData.name || user?.email || '?').charAt(0).toUpperCase()

  return (
    <div className="animate-fade-in max-w-3xl">
      <div className="mb-6">
        <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Account</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Profile</h1>
      </div>

      {success && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <p className="text-sm text-emerald-700">Profile updated successfully!</p>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Header with image */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-6">
            {/* Profile Image */}
            <div className="relative">
              <div
                onClick={() => !uploadingImage && fileInputRef.current?.click()}
                className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold cursor-pointer overflow-hidden transition ${
                  profileImage
                    ? 'bg-cover bg-center'
                    : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white'
                } ${uploadingImage ? 'opacity-70' : 'hover:ring-4 hover:ring-indigo-100'}`}
                style={profileImage ? { backgroundImage: `url(${profileImage})` } : {}}
              >
                {!profileImage && initial}
                
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                  <Camera className="w-6 h-6 text-white" />
                </div>
                
                {uploadingImage && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
              </div>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-600 hover:text-indigo-600 hover:border-indigo-300 transition shadow-sm"
              >
                <Camera className="w-4 h-4" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-slate-900">{formData.name || 'Merchant'}</h2>
              <p className="text-sm text-slate-500">{formData.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 capitalize">
                  <Shield className="w-3 h-3" />
                  {merchantRole.replace('-', ' ')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <User className="w-4 h-4 inline mr-1" />
                Full Name
              </label>
              {editing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-sm text-slate-900 py-2">{formData.name || '—'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Mail className="w-4 h-4 inline mr-1" />
                Email
              </label>
              <p className="text-sm text-slate-900 py-2">{formData.email}</p>
              <p className="text-xs text-slate-500">Contact admin to change email</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Store className="w-4 h-4 inline mr-1" />
                Store Name
              </label>
              {editing ? (
                <input
                  type="text"
                  value={formData.merchantName}
                  onChange={(e) => setFormData({ ...formData, merchantName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-sm text-slate-900 py-2">{formData.merchantName || '—'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Phone className="w-4 h-4 inline mr-1" />
                Phone
              </label>
              {editing ? (
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-sm text-slate-900 py-2">{formData.phone || '—'}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <MapPin className="w-4 h-4 inline mr-1" />
                Address
              </label>
              {editing ? (
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              ) : (
                <p className="text-sm text-slate-900 py-2">{formData.address || '—'}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Store Description
              </label>
              {editing ? (
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              ) : (
                <p className="text-sm text-slate-900 py-2">{formData.description || '—'}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-200">
            {editing ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
              >
                Edit Profile
              </button>
            )}

            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
