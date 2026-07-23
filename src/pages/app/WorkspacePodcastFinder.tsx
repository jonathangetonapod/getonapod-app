import { useParams } from 'react-router-dom'
import PodcastFinder from '@/pages/admin/PodcastFinder'

const WorkspacePodcastFinder = () => {
  const { clientId = '' } = useParams()
  return <PodcastFinder key={clientId || 'missing'} fixedClientId={clientId} />
}

export default WorkspacePodcastFinder
