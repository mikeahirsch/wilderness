import sha256 from "crypto-js/sha256";

export interface Ethscription {
  block_confirmations: number;
  content_taken_down_at: null | string;
  content_uri: string;
  creation_timestamp: string;
  creator: string;
  current_owner: string;
  ethscription_number: number;
  image_removed_by_request_of_rights_holder: boolean;
  mimetype: string;
  min_block_confirmations: number;
  overall_order_number_as_int: string;
  previous_owner: null | string;
  transaction_hash: string;
  transaction_index: number;
  valid_data_uri: boolean;
}

export interface FetchResponse {
  ethscription: Ethscription;
}

export interface FetchRequest {
  x: number;
  y: number;
  resolve: (value: Ethscription | null) => void;
  reject: (reason?: any) => void;
}

export interface EthscriptionCacheItem {
  ethscription: Ethscription;
  timestamp: number;
}

export const fetchQueue: FetchRequest[] = [];
export const ethscriptionCache: { [key: string]: EthscriptionCacheItem } = {};
export const cacheLifetime = 5 * 60 * 1000; // Cache items expire after 5 minutes

export const fetchEthscription = async (x: number, y: number) => {
  const hash = sha256(`data:,${x},${y}`);

  // Check if we have a cached response
  const cachedResponse = ethscriptionCache[hash.toString()];

  if (cachedResponse) {
    const now = Date.now();
    const age = now - cachedResponse.timestamp;

    if (age < cacheLifetime) {
      // Cached item is still fresh, so we can return it
      return cachedResponse.ethscription;
    } else {
      // Cached item has expired, so we remove it from the cache
      delete ethscriptionCache[hash.toString()];
    }
  }

  // If we don't have a cached response, fetch a new one
  const response = await fetch(
    `https://api.ethscriptions.com/api/ethscriptions/exists/${hash}`
  );
  const json: FetchResponse = await response.json();

  // Store the new response in the cache with the current timestamp
  ethscriptionCache[hash.toString()] = {
    ethscription: json.ethscription,
    timestamp: Date.now(),
  };

  return json.ethscription;
};
