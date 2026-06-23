import { ExternalLink, CheckCircle, Clock, AlertCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { serviceUrl } from '../config/api'

export default function JenkinsPipeline() {
  const [loading, setLoading] = useState(false)

  const pipelines = [
    {
      name: 'Build & Deploy Main',
      status: 'success',
      branch: 'main',
      commit: 'abc123def',
      duration: '4m 23s',
      timestamp: '2 hours ago',
      stages: [
        { name: 'Checkout', status: 'success' },
        { name: 'Lint Code', status: 'success' },
        { name: 'Build Docker', status: 'success' },
        { name: 'Run Tests', status: 'success' },
        { name: 'Push Registry', status: 'success' },
        { name: 'Deploy K8s', status: 'success' }
      ]
    },
    {
      name: 'Build & Deploy Develop',
      status: 'running',
      branch: 'develop',
      commit: 'xyz789uvw',
      duration: '2m 15s',
      timestamp: '5 mins ago',
      stages: [
        { name: 'Checkout', status: 'success' },
        { name: 'Lint Code', status: 'success' },
        { name: 'Build Docker', status: 'running' },
        { name: 'Run Tests', status: 'pending' },
        { name: 'Push Registry', status: 'pending' },
        { name: 'Deploy K8s', status: 'pending' }
      ]
    },
    {
      name: 'Build & Deploy Feature',
      status: 'failed',
      branch: 'feature/new-api',
      commit: 'ijk345lmn',
      duration: '1m 47s',
      timestamp: '30 mins ago',
      stages: [
        { name: 'Checkout', status: 'success' },
        { name: 'Lint Code', status: 'failed' },
        { name: 'Build Docker', status: 'skipped' },
        { name: 'Run Tests', status: 'skipped' },
        { name: 'Push Registry', status: 'skipped' },
        { name: 'Deploy K8s', status: 'skipped' }
      ]
    }
  ]

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-6 h-6 text-green-500" />
      case 'running':
        return <Clock className="w-6 h-6 text-blue-500 animate-spin" />
      case 'failed':
        return <AlertCircle className="w-6 h-6 text-red-500" />
      default:
        return <Clock className="w-6 h-6 text-gray-500" />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800'
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'pending':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="container mx-auto px-4">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Jenkins CI/CD Pipeline</h2>
        <a
          href={serviceUrl('jenkins')}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Open Jenkins
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Pipeline Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-l-green-500">
          <p className="text-gray-600 text-sm mb-2">Successful Builds</p>
          <p className="text-3xl font-bold text-gray-900">156</p>
          <p className="text-xs text-gray-500 mt-2">Last 30 days</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-l-red-500">
          <p className="text-gray-600 text-sm mb-2">Failed Builds</p>
          <p className="text-3xl font-bold text-gray-900">8</p>
          <p className="text-xs text-gray-500 mt-2">Last 30 days</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-l-blue-500">
          <p className="text-gray-600 text-sm mb-2">Avg Build Time</p>
          <p className="text-3xl font-bold text-gray-900">4m 45s</p>
          <p className="text-xs text-gray-500 mt-2">Last 30 days</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-l-purple-500">
          <p className="text-gray-600 text-sm mb-2">Success Rate</p>
          <p className="text-3xl font-bold text-gray-900">95.3%</p>
          <p className="text-xs text-gray-500 mt-2">Last 30 days</p>
        </div>
      </div>

      {/* Pipeline Jobs */}
      <div className="space-y-6">
        {pipelines.map((pipeline, idx) => (
          <div key={idx} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-start gap-4">
                {getStatusIcon(pipeline.status)}
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{pipeline.name}</h3>
                  <div className="flex gap-4 mt-2 text-sm text-gray-600">
                    <span>Branch: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{pipeline.branch}</span></span>
                    <span>Commit: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{pipeline.commit}</span></span>
                    <span>{pipeline.timestamp}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className={`px-4 py-2 rounded-full font-semibold text-sm ${getStatusColor(pipeline.status)}`}>
                  {pipeline.status.toUpperCase()}
                </span>
                <p className="text-sm text-gray-600 mt-2">{pipeline.duration}</p>
              </div>
            </div>

            {/* Pipeline Stages */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700 mb-3">Build Stages:</p>
              <div className="space-y-2">
                {pipeline.stages.map((stage, stageIdx) => (
                  <div key={stageIdx} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-gray-200 text-gray-700">
                      {stageIdx + 1}
                    </div>
                    <span className="flex-1 font-semibold text-gray-800">{stage.name}</span>
                    <span className={`px-3 py-1 rounded text-xs font-semibold ${getStatusColor(stage.status)}`}>
                      {stage.status}
                    </span>
                    {stage.status === 'running' && (
                      <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* How to Trigger */}
      <div className="bg-blue-50 rounded-lg shadow p-6 mt-8 border-l-4 border-l-blue-500">
        <h3 className="text-lg font-bold text-gray-900 mb-4">How to Trigger a Pipeline</h3>
        <ol className="space-y-2 text-gray-700 list-decimal list-inside">
          <li>Push code to any branch (main, develop, or feature/*)</li>
          <li>Jenkins webhook automatically triggers the pipeline</li>
          <li>Pipeline runs: Checkout -> Lint -> Build -> Test -> Push -> Deploy</li>
          <li>Monitor progress in Jenkins UI: <code className="bg-white px-2 py-1 rounded">{serviceUrl('jenkins')}</code></li>
          <li>On success, new version is deployed to Kubernetes</li>
        </ol>
      </div>
    </div>
  )
}
