import { supabase } from './supabaseClient.js';

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Devuelve el hogar del usuario si ya pertenece a uno, o null.
export async function getMyHousehold(userId) {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, display_name, households ( id, name, invite_code )')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data.households;
}

// Crea un hogar nuevo y te agrega como miembro (operación atómica vía RPC).
export async function createHousehold(userId, displayName) {
  const { data, error } = await supabase.rpc('create_household', {
    p_name: `Hogar de ${displayName}`,
    p_display_name: displayName,
  });
  if (error) throw error;
  return data;
}

// Se une a un hogar existente usando el código de invitación (operación atómica vía RPC).
export async function joinHousehold(userId, displayName, inviteCode) {
  const { data, error } = await supabase.rpc('join_household', {
    p_invite_code: inviteCode,
    p_display_name: displayName,
  });
  if (error) throw error;
  return data;
}
