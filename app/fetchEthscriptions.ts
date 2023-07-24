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
  [key: string]: Ethscription;
}

export interface FetchRequest {
  x: number;
  y: number;
  subscribers: Subscriber[];
}

export interface QueueFetchRequest extends FetchRequest {
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
}

export type Unsubscribe = () => void;

export const ethscriptionCache: { [key: string]: EthscriptionCacheItem } = {};
export const cacheLifetime = 5 * 60 * 1000; // Cache items expire after 5 minutes

export const getEthscriptionCache = (x: number, y: number) => {
  const hash = sha256(`data:,${x},${y}`).toString();
  const cachedResponse = ethscriptionCache[hash];
  return cachedResponse;
};

let isScrollingFast = false;

export const setIsScrollingFast = (_isScrollingFast: boolean) => {
  isScrollingFast = _isScrollingFast;

  if (!isScrollingFast) {
    fetchEthscriptions();
  }
};

const fetchEthscriptionsFromServer = async (
  fetchRequests: QueueFetchRequest[]
) => {
  const hashes = fetchRequests.map((request) =>
    sha256(`data:,${request.x},${request.y}`).toString()
  );
  const subscribersList = fetchRequests.map(
    (request) => request.subscribers || []
  );

  return fetch(`https://api.ethscriptions.com/api/ethscriptions/exists_multi`, {
    method: "POST",
    body: JSON.stringify(hashes),
  }).then(async (response) => {
    const json: FetchResponse = await response.json();

    hashes.forEach((hash, index) => {
      const ethscription = json[hash] ?? null;

      let cachedResponse = ethscriptionCache[hash];
      if (!cachedResponse) {
        cachedResponse = ethscriptionCache[hash] = {
          ethscription: null,
          timestamp: Date.now(),
          subscribers: subscribersList[index] || [],
        };
      }

      cachedResponse.ethscription = ethscription;
      cachedResponse.timestamp = Date.now();
      cachedResponse.subscribers.push(...subscribersList[index]);

      cachedResponse.subscribers.forEach((subscriber) =>
        subscriber.callback(cachedResponse.ethscription)
      );
    });

    return json;
  });
};

export let fetchQueue: QueueFetchRequest[] = [];
let isFetching = false;

export const fetchEthscriptions = async () => {
  // If a fetch is already in progress or is scrolling fast, simply return
  if (isFetching || isScrollingFast) return;

  // Start fetching
  isFetching = true;

  while (fetchQueue.length > 0) {
    // Get all items currently in the queue
    const currentBatch = [...fetchQueue];

    // Clear the queue
    fetchQueue = [];

    try {
      // Process the current batch
      const ethscriptions = await fetchEthscriptionsFromServer(currentBatch);

      // Resolve the promises for each fetch request in the batch
      currentBatch.forEach((request) => {
        const hash = sha256(`data:,${request.x},${request.y}`).toString();
        const matchingEthscription = ethscriptions[hash];
        request.resolve(matchingEthscription);
      });
    } catch (error) {
      // Reject the promises for each fetch request in the batch
      currentBatch.forEach((request) => request.reject(error));
    }
  }

  // Fetching is done
  isFetching = false;
};

// Use this function to add a request to the fetch queue
export const addToFetchQueue = (request: FetchRequest) => {
  const promise = new Promise<Ethscription | null>((resolve, reject) => {
    const cachedResponse = getEthscriptionCache(request.x, request.y);
    if (
      cachedResponse &&
      cachedResponse.ethscription &&
      Date.now() - cachedResponse.timestamp < cacheLifetime
    ) {
      resolve(cachedResponse.ethscription);
    } else {
      fetchQueue.push({ ...request, resolve, reject });
      fetchEthscriptions();
    }
  });

  return promise;
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
    addToFetchQueue({ x, y, subscribers: [subscriber] })
      .then((ethscription) => {
        callback(ethscription);
      })
      .catch((error) => {
        console.error(error);
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
