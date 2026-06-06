import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import {
  User as UserIcon,
  Mail,
  Hash,
  Building2,
  Calendar,
  ShieldCheck,
  LogOut,
  Pencil,
  Check,
  X,
  Lock,
  Camera,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { API_BASE, auth, authUpload } from '../config/api'
import { useAuthStore } from '../features/auth/store/authStore'

export default function Profile({ user, onLogout }) {
  const [userData, setUserData] = useState(user)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({ name: user?.name || '' })
  const [profileImage, setProfileImage] = useState(user?.profileImage || user?.avatar || null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  
  const updateUser = useAuthStore((state) => state.updateUser)
  const fileInputRef = useRef(null)

  // Fetch latest profile from backend on mount to ensure profileImage persists
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/v1/merchants/profile`, auth())
        if (response.data?.success && response.data?.data) {
          const data = response.data.data
          if (data.profileImage) {
            setProfileImage(data.profileImage)
            updateUser({ profileImage: data.profileImage })
            setUserData((prev) => ({ ...prev, profileImage: data.profileImage }))
          }
        }
      } catch (err) {
        // Non-critical: fall back to stored value
        console.debug('Could not fetch profile:', err.message)
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
      formData.append('type', 'user-profile')

      const response = await axios.post(
        `${API_BASE}/api/v1/upload/profile-image`,
        formData,
        authUpload()
      )

      if (response.data?.success && response.data?.url) {
        setProfileImage(response.data.url)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
        
        // Update Zustand store (persists to localStorage)
        updateUser({ profileImage: response.data.url })
        setUserData({ ...userData, profileImage: response.data.url })
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload image')
    } finally {
      setUploadingImage(false)
    }
  }

  const handleSave = () => {
    const updated = { ...userData, name: formData.name }
    updateUser({ name: formData.name })
    setUserData(updated)
    setEditing(false)
  }

  const handleCancel = () => {
    setFormData({ name: userData?.name || '' })
    setEditing(false)
  }

  const initial = (userData?.name || userData?.email || '?').charAt(0).toUpperCase()
  const role = userData?.role || (userData?.roles && userData.roles[0]) || 'user'
  const memberSince = userData?.createdAt
    ? new Date(userData.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })
    : new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page header */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Account</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Your profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Personal information attached to your alumni account.
        </p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: identity card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 lg:sticky lg:top-20 self-start">
          <div className="flex flex-col items-center text-center">
            {/* Profile Image */}
            <div className="relative">
              <div
                onClick={() => !uploadingImage && fileInputRef.current?.click()}
                className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold cursor-pointer overflow-hidden transition ${
                  profileImage
                    ? 'bg-cover bg-center'
                    : 'bg-indigo-600 text-white'
                }`}
                style={profileImage ? { backgroundImage: `url(${profileImage})` } : {}}
              >
                {!profileImage && initial}
                {uploadingImage && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
                {!uploadingImage && (
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition flex items-center justify-center opacity-0 hover:opacity-100">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
            <p className="font-semibold text-slate-900 mt-3">{userData?.name || 'Alumni member'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{userData?.email}</p>
            <span className="mt-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 capitalize">
              <ShieldCheck className="w-3 h-3" />
              {role}
            </span>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Member since</span>
              <span className="font-medium text-slate-900">{memberSince}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">User ID</span>
              <span className="font-mono text-slate-700">
                {(userData?.userId || userData?.user_id || '').toString().slice(-8) || '—'}
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

        {/* Right: details */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Personal information</h2>
                <p className="text-xs text-slate-500 mt-0.5">Update how your name appears on orders.</p>
              </div>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              ) : (
                <div className="flex gap-1">
                  <button
                    onClick={handleSave}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
              )}
            </header>

            <dl className="divide-y divide-slate-100">
              <Row icon={UserIcon} label="Full name">
                {editing ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full max-w-sm px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <span className="text-sm font-medium text-slate-900">{userData?.name || '—'}</span>
                )}
              </Row>
              <Row icon={Mail} label="Email" hint="Email cannot be changed">
                <span className="text-sm font-medium text-slate-900">{userData?.email}</span>
              </Row>
              <Row icon={Hash} label="Alumni ID">
                <span className="font-mono text-xs text-slate-700">
                  {userData?.alumni_id || '—'}
                </span>
              </Row>
              {userData?.department && (
                <Row icon={Building2} label="Department">
                  <span className="text-sm font-medium text-slate-900">{userData.department}</span>
                </Row>
              )}
              {userData?.graduation_year && (
                <Row icon={Calendar} label="Graduation year">
                  <span className="text-sm font-medium text-slate-900">{userData.graduation_year}</span>
                </Row>
              )}
            </dl>
          </section>

          {/* Security section */}
          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Security</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Password reset and active sessions are managed via Keycloak SSO.
                  </p>
                </div>
              </div>
              <a
                href="http://localhost:8080/realms/nitte-realm/account"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
              >
                Open SSO portal →
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Row({ icon: Icon, label, hint, children }) {
  return (
    <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-center">
      <dt className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </dt>
      <dd className="sm:col-span-2">
        {children}
        {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
      </dd>
    </div>
  )
}
