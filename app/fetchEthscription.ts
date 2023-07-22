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
  subscribers?: Subscriber[];
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

export const fetchPromises: { [hash: string]: Promise<Ethscription | null> } =
  {};

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

  if (!fetchPromises[hash]) {
    // directly assign the fetch operation to `fetchPromises[hash]`
    fetchPromises[hash] = fetch(
      `https://api.ethscriptions.com/api/ethscriptions/exists/${hash}`
    )
      .then(async (response) => {
        const json: FetchResponse = await response.json();

        // Check if we have a cached response
        let cachedResponse = ethscriptionCache[hash];
        if (!cachedResponse) {
          // If we don't have a cached response, create an empty cache entry
          cachedResponse = ethscriptionCache[hash] = {
            ethscription: null,
            timestamp: Date.now(),
            subscribers,
            fetchPromise: null,
          };
        }

        // Store the new response in the cache with the current timestamp
        cachedResponse.ethscription = json.ethscription;
        cachedResponse.timestamp = Date.now();
        cachedResponse.fetchPromise = null;

        // Call the subscribers with the new data
        cachedResponse.subscribers.forEach((subscriber) =>
          subscriber.callback(cachedResponse.ethscription)
        );

        return json.ethscription;
      })
      .catch((error) => {
        // handle error and remove from cache
        delete fetchPromises[hash];
        throw error; // rethrow the error so it can be caught and handled in the calling code
      });
  }

  return fetchPromises[hash];
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
    fetchEthscription(x, y)
      .then((ethscription) => {
        ethscriptionCache[hash] = {
          ethscription,
          timestamp: Date.now(),
          subscribers: [subscriber],
        };
        callback(ethscription);
      })
      .catch((error) => {
        console.log(error);
      });
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
