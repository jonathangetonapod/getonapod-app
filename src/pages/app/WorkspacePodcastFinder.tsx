import { Navigate, useParams } from 'react-router-dom'

const WorkspacePodcastFinder = () => {
  const { clientId = '' } = useParams()
  return <Navigate to={`/app/podcast-finder?client=${encodeURIComponent(clientId)}`} replace />
}

export default WorkspacePodcastFinder
