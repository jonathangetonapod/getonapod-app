import { toast } from 'sonner'

/**
 * The one confirmation every autosaving setting shows. One id, so a burst of
 * saves (a reset, a field and its neighbour) shows one toast, not a stack.
 */
export const notifySaved = () => toast.success('Saved', { id: 'settings-saved', duration: 1500 })
