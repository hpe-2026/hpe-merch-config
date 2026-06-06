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
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { API_BASE, auth, authUpload } from '../config/api'

export default function AdminProfile({ user, onLogout, onUpdateUser }) {
  const [userData, setUserData] = useState(user)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({ name: user?.name || '' })
  const [profileImage, setProfileImage] = useState(user?.profileImage || user?.avatar || null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  
  const fileInputRef = useRef(null)

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
      formData.append('type', 'admin-profile')

      const response = await axios.post(
        `${API_BASE}/api/v1/upload/profile-image`,
        formData,
        authUpload()
      )

      if (response.data?.success && response.data?.url) {
        setProfileImage(response.data.url)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
        
        // Update parent state and localStorage
        if (onUpdateUser) {
          onUpdateUser({ profileImage: response.data.url })
        }
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
    if (onUpdateUser) {
      onUpdateUser({ name: formData.name })
    }
    setUserData(updated)
    setEditing(false)
  }

  const handleCancel = () => {
    setFormData({ name: userData?.name || '' })
    setEditing(false)
  }

  const initial = (userData?.name || userData?.email || '?').charAt(0).toUpperCase()
  const roles = userData?.roles || (userData?.role ? [userData.role] : ['admin'])

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Account</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Admin profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Operator account details and active session info.
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
        {/* Identity card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 lg:sticky lg:top-32 self-start">
          <div className="flex flex-col items-center text-center">
            {/* Profile Image */}
            <div className="relative">
              <div
                onClick={() => !uploadingImage && fileInputRef.current?.click()}
                className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold cursor-pointer overflow-hidden transition ${
                  profileImage
                    ? 'bg-cover bg-center'
                    : 'bg-slate-900 text-white'
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
            <p className="font-semibold text-slate-900 mt-3">{userData?.name || 'Administrator'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{userData?.email}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1">
              {roles.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 capitalize"
                >
                  <ShieldCheck className="w-3 h-3" />
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">User ID</span>
              <span className="font-mono text-slate-700">
                {(userData?.userId || userData?.user_id || '').toString().slice(-8) || '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Auth source</span>
              <span className="font-medium text-slate-900">Keycloak / JWT</span>
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

        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Profile information</h2>
                <p className="text-xs text-slate-500 mt-0.5">Display name shown across the admin console.</p>
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
              <Row icon={Mail} label="Email" hint="Managed by your identity provider.">
                <span className="text-sm font-medium text-slate-900">{userData?.email || '—'}</span>
              </Row>
              <Row icon={Hash} label="Roles">
                <div className="flex flex-wrap gap-1">
                  {roles.map((r) => (
                    <span
                      key={r}
                      className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </Row>
            </dl>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Security</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Reset your password and review active sessions in the Keycloak admin console.
                  </p>
                </div>
              </div>
              <a
                href="http://localhost:8080/admin/master/console/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
              >
                Open Keycloak →
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
