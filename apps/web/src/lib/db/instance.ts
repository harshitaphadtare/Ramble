import { Vault } from './repo';

/** The one Vault for this app (shared by the user store and the sync engine). */
export const vault = new Vault();
