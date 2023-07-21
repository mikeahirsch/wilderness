"use client";

import React, { useState, useEffect, CSSProperties, useRef } from "react";
import {
  FixedSizeGrid as Grid,
  GridChildComponentProps,
  GridOnItemsRenderedProps,
  GridOnScrollProps,
} from "react-window";
import sha256 from "crypto-js/sha256";

interface Ethscription {
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

interface FetchResponse {
  ethscription: Ethscription;
}

interface FetchRequest {
  x: number;
  y: number;
  resolve: (value: Ethscription | null) => void;
  reject: (reason?: any) => void;
}

interface EthscriptionCacheItem {
  ethscription: Ethscription;
  timestamp: number;
}

const ethAddressToColor = (address: string) => {
  const rawAddress = address.slice(2);
  const colorCode = rawAddress.slice(0, 6);
  return "#" + colorCode;
};

const fetchQueue: FetchRequest[] = [];
const ethscriptionCache: { [key: string]: EthscriptionCacheItem } = {};
const cacheLifetime = 5 * 60 * 1000; // Cache items expire after 5 minutes

const fetchEthscription = async (x: number, y: number) => {
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

interface CellProps extends GridChildComponentProps {
  data: {
    columnCount: number;
    rowCount: number;
    originX: React.MutableRefObject<number>;
    originY: React.MutableRefObject<number>;
  };
}

const Cell: React.FC<CellProps> = ({ columnIndex, rowIndex, style, data }) => {
  const x =
    columnIndex + data.originX.current - Math.floor(data.columnCount / 2);
  const y = rowIndex + data.originY.current - Math.floor(data.rowCount / 2);

  const [cellData, setCellData] = useState<{
    ethscription?: Ethscription | null;
  } | null>(null);

  useEffect(() => {
    const fetchPromise = new Promise<Ethscription | null>((resolve, reject) => {
      fetchQueue.push({ x, y, resolve, reject });
    });

    fetchPromise
      .then((ethscription) => {
        setCellData({ ethscription });
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      const requestIndex = fetchQueue.findIndex(
        (request) => request.x === x && request.y === y
      );

      if (requestIndex !== -1) {
        fetchQueue.splice(requestIndex, 1);
      }
    };
  }, [x, y]);

  return (
    <div style={style as CSSProperties}>
      {cellData?.ethscription?.current_owner ? (
        <div
          className={`w-full h-full flex items-center justify-center`}
          style={{
            backgroundColor: ethAddressToColor(
              cellData.ethscription.current_owner
            ),
          }}
        >
          {`${x},${y}`}
        </div>
      ) : (
        <div
          className={
            cellData
              ? `w-full h-full flex items-center justify-center`
              : "animate-pulse w-full h-full flex items-center justify-center text-black bg-white"
          }
        >
          {`${x},${y}`}
        </div>
      )}
    </div>
  );
};

const columnCount = 200; // Maintain a fixed size
const rowCount = 200; // Maintain a fixed size

const InfiniteGrid: React.FC = () => {
  const originX = useRef(0);
  const originY = useRef(0);
  const currentScroll = useRef<GridOnScrollProps>();
  const [windowDimensions, setWindowDimensions] = useState({
    height: 800,
    width: 600,
  });
  const [dimensionsInitialized, setDimensionsInitialized] = useState(false);
  const gridRef = useRef<Grid>(null);
  const fetchIntervalRef = useRef<NodeJS.Timeout>();
  const scrollDebounceRef = useRef<NodeJS.Timeout>();
  const [isScrolling, setIsScrolling] = useState(false);
  // const visibleRowStartIndex = useRef(Math.floor(rowCount / 2));
  // const visibleColumnStartIndex = useRef(Math.floor(columnCount / 2));

  useEffect(() => {
    if (!isScrolling) {
      fetchIntervalRef.current = setInterval(async () => {
        if (fetchQueue.length > 0) {
          const fetchRequest = fetchQueue.shift();

          if (fetchRequest) {
            try {
              const ethscription = await fetchEthscription(
                fetchRequest.x,
                fetchRequest.y
              );
              fetchRequest.resolve(ethscription);
            } catch (error) {
              fetchRequest.reject(error);
            }
          }
        }
      }, 50);

      return () => {
        if (fetchIntervalRef.current) {
          clearInterval(fetchIntervalRef.current);
        }
      };
    }
  }, [isScrolling]);

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        height: window.innerHeight,
        width: window.innerWidth,
      });
      if (!dimensionsInitialized) {
        setDimensionsInitialized(true);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);
      handleResize();
    }

    return () => window.removeEventListener("resize", handleResize);
  }, [dimensionsInitialized]);

  const SCROLL_STOP_DELAY = 500; // Milliseconds to wait after scrolling stops before fetching

  const handleItemsRendered = ({
    overscanColumnStartIndex,
    overscanRowStartIndex,
    overscanColumnStopIndex,
    overscanRowStopIndex,
  }: GridOnItemsRenderedProps) => {
    const closeToRightEdge = overscanColumnStopIndex >= columnCount - 1;
    const closeToBottomEdge = overscanRowStopIndex >= rowCount - 1;
    const closeToLeftEdge = overscanColumnStartIndex <= 0;
    const closeToTopEdge = overscanRowStartIndex <= 0;

    if (currentScroll.current && gridRef.current) {
      if (closeToRightEdge) {
        originX.current += 100;
        gridRef.current.scrollTo({
          scrollTop: currentScroll.current.scrollTop,
          scrollLeft: currentScroll.current.scrollLeft - cellSize * 100, // we assume cellSize to be the size of your cell
        });
      }

      if (closeToBottomEdge) {
        originY.current += 100;
        gridRef.current.scrollTo({
          scrollTop: currentScroll.current.scrollTop - cellSize * 100,
          scrollLeft: currentScroll.current.scrollLeft,
        });
      }

      if (closeToLeftEdge) {
        originX.current -= 100;
        gridRef.current.scrollTo({
          scrollTop: currentScroll.current.scrollTop,
          scrollLeft: currentScroll.current.scrollLeft + cellSize * 100,
        });
      }

      if (closeToTopEdge) {
        originY.current -= 100;
        gridRef.current.scrollTo({
          scrollTop: currentScroll.current.scrollTop + cellSize * 100,
          scrollLeft: currentScroll.current.scrollLeft,
        });
      }
    }

    if (!isScrolling) {
      setIsScrolling(true);
    }

    // Clear the existing timeout, if any
    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current);
    }

    // Set a new timeout to trigger fetching after SCROLL_STOP_DELAY milliseconds
    scrollDebounceRef.current = setTimeout(async () => {
      setIsScrolling(false);
    }, SCROLL_STOP_DELAY);
  };

  const handleScroll = (props: GridOnScrollProps) => {
    currentScroll.current = props;
  };

  if (!dimensionsInitialized) {
    return null;
  }

  const cellSize = Math.ceil(
    (windowDimensions.height > windowDimensions.width
      ? windowDimensions.width
      : windowDimensions.height) / 3
  );
  const halfCellSize = cellSize / 2;

  return (
    <>
      <Grid
        ref={gridRef}
        columnCount={columnCount}
        rowCount={rowCount}
        columnWidth={cellSize}
        rowHeight={cellSize}
        height={windowDimensions.height}
        width={windowDimensions.width}
        initialScrollTop={
          Math.floor(rowCount / 2) * cellSize -
          windowDimensions.height / 2 +
          halfCellSize
        }
        initialScrollLeft={
          Math.floor(columnCount / 2) * cellSize -
          windowDimensions.width / 2 +
          halfCellSize
        }
        onScroll={handleScroll}
        onItemsRendered={handleItemsRendered}
        itemData={{ columnCount, rowCount, originX, originY }}
      >
        {Cell}
      </Grid>
      <button
        className="btn absolute bottom-8 right-8"
        onClick={() => {
          originX.current = 0;
          originY.current = 0;
          gridRef.current?.scrollToItem({
            columnIndex: Math.floor(columnCount / 2),
            rowIndex: Math.floor(rowCount / 2),
            align: "center",
          });
        }}
      >
        Go to Center
      </button>
    </>
  );
};

export default InfiniteGrid;
