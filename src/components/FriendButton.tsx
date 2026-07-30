import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import type { FriendEntry } from '../hooks/useFriendships'

// Le bouton ami à 4 états : aucune relation / demande envoyée / demande reçue / amis.
export default function FriendButton({ targetUsername, relation, onChange }: {
  targetUsername: string
  relation: FriendEntry | null
  onChange: () => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)

  async function act(rpc: 'send_friend_request' | 'accept_friend_request' | 'remove_friendship') {
    setError(null)
    const { error } = await supabase.rpc(rpc, { p_username: targetUsername })
    if (error) return setError(errorMessage(error))
    await onChange()
  }

  return (
    <>
      {!relation && (
        <button onClick={() => act('send_friend_request')}>Ajouter en ami</button>
      )}
      {relation?.status === 'pending' && relation.direction === 'sent' && (
        <button className="secondary" onClick={() => act('remove_friendship')}>
          Demande envoyée — Annuler
        </button>
      )}
      {relation?.status === 'pending' && relation.direction === 'received' && (
        <button onClick={() => act('accept_friend_request')}>Accepter la demande d'ami</button>
      )}
      {relation?.status === 'accepted' && (
        <button className="secondary" onClick={() => act('remove_friendship')}>
          Amis ✓ — Retirer
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </>
  )
}
