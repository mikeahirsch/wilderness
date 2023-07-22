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

export interface Subscriber {
  callback: (ethscription: Ethscription | null) => void;
  count: number;
}

export interface EthscriptionCacheItem {
  ethscription: Ethscription | null;
  timestamp: number;
  subscribers: Subscriber[];
  fetchPromise?: Promise<Ethscription | null> | null;
}

export type Unsubscribe = () => void;

export const fetchQueue: FetchRequest[] = [];
export const ethscriptionCache: { [key: string]: EthscriptionCacheItem } = {};
export const cacheLifetime = 5 * 60 * 1000; // Cache items expire after 5 minutes

export const getEthscriptionCache = (x: number, y: number) => {
  const hash = sha256(`data:,${x},${y}`).toString();
  const cachedResponse = ethscriptionCache[hash];
  return cachedResponse;
};

export const fetchEthscription = async (
  x: number,
  y: number,
  subscribers: Subscriber[] = []
) => {
  const hash = sha256(`data:,${x},${y}`).toString();

  // Check if we have a cached response
  let cachedResponse = ethscriptionCache[hash];

  if (cachedResponse) {
    const now = Date.now();
    const age = now - cachedResponse.timestamp;

    // If there is a fetch in progress, return the result of that fetch
    if (cachedResponse.fetchPromise) {
      return await cachedResponse.fetchPromise;
    }

    if (age < cacheLifetime) {
      // Cached item is still fresh, so we can return it
      return cachedResponse.ethscription;
    } else {
      // Cached item has expired, so we clear the cached data
      cachedResponse.ethscription = null;
    }
  } else {
    // If we don't have a cached response, create an empty cache entry
    cachedResponse = ethscriptionCache[hash] = {
      ethscription: null,
      timestamp: Date.now(),
      subscribers,
      fetchPromise: null,
    };
  }

  // If we don't have a cached response, fetch a new one
  const fetchPromise = fetch(
    `https://api.ethscriptions.com/api/ethscriptions/exists/${hash}`
  )
    .then((response) => response.json())
    .then((json: FetchResponse) => {
      // Store the new response in the cache with the current timestamp
      cachedResponse.ethscription = json.ethscription;
      cachedResponse.timestamp = Date.now();
      cachedResponse.fetchPromise = null;

      // Call the subscribers with the new data
      cachedResponse.subscribers.forEach((subscriber) =>
        subscriber.callback(cachedResponse.ethscription)
      );

      return json.ethscription;
    });

  // Store the fetch promise in the cache so other calls can wait for it
  cachedResponse.fetchPromise = fetchPromise;

  const res = await fetchPromise;

  return res;
};

export const unsubscribeToEthscription = (
  x: number,
  y: number,
  callback: (ethscription: Ethscription | null) => void
) => {
  const hash = sha256(`data:,${x},${y}`).toString();

  if (ethscriptionCache[hash]) {
    const existingSubscriberIndex = ethscriptionCache[
      hash
    ].subscribers.findIndex((subscriber) => subscriber.callback === callback);

    if (existingSubscriberIndex !== -1) {
      ethscriptionCache[hash].subscribers[existingSubscriberIndex].count--;

      if (
        ethscriptionCache[hash].subscribers[existingSubscriberIndex].count === 0
      ) {
        ethscriptionCache[hash].subscribers.splice(existingSubscriberIndex, 1);
      }
    }
  }
};

export const subscribeToEthscription = (
  x: number,
  y: number,
  callback: (ethscription: Ethscription | null) => void
): Unsubscribe => {
  const hash = sha256(`data:,${x},${y}`).toString();
  if (!ethscriptionCache[hash]) {
    const subscriber: Subscriber = { callback, count: 1 };
    fetchEthscription(x, y, [subscriber]);
  } else {
    const existingSubscriberIndex = ethscriptionCache[
      hash
    ].subscribers.findIndex((subscriber) => subscriber.callback === callback);

    if (existingSubscriberIndex === -1) {
      const subscriber: Subscriber = { callback, count: 1 };
      ethscriptionCache[hash].subscribers.push(subscriber);
    } else {
      ethscriptionCache[hash].subscribers[existingSubscriberIndex].count++;
    }

    callback(ethscriptionCache[hash].ethscription);
  }

  return () => unsubscribeToEthscription(x, y, callback);
};
