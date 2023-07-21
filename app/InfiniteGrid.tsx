"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  FixedSizeGrid as Grid,
  GridOnItemsRenderedProps,
  GridOnScrollProps,
} from "react-window";
import { fetchEthscription, fetchQueue } from "./fetchEthscription";
import { Cell } from "./Cell";
import { useSearchParams } from "next/navigation";

export const GRID_SIZE = 200; // Maintain a fixed size
export const SCROLL_STOP_DELAY = 500; // Milliseconds to wait after scrolling stops before fetching

const InfiniteGrid: React.FC = () => {
  const searchParams = useSearchParams();
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

  const plot = useMemo(
    () => searchParams.get("plot") as string,
    [searchParams]
  );

  const navigateToXY = useCallback((x: number, y: number) => {
    originX.current = x;
    originY.current = y;
    gridRef.current?.scrollToItem({
      columnIndex: Math.floor(GRID_SIZE / 2),
      rowIndex: Math.floor(GRID_SIZE / 2),
      align: "center",
    });
  }, []);

  useEffect(() => {
    if (/(-?\d+)\,(-?\d+)/.test(plot)) {
      const x = Number(plot.split(",")[0]);
      const y = Number(plot.split(",")[1]);
      navigateToXY(x, y);
    }
  }, [navigateToXY, plot]);

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

  const handleItemsRendered = ({
    overscanColumnStartIndex,
    overscanRowStartIndex,
    overscanColumnStopIndex,
    overscanRowStopIndex,
  }: GridOnItemsRenderedProps) => {
    const closeToRightEdge = overscanColumnStopIndex >= GRID_SIZE - 1;
    const closeToBottomEdge = overscanRowStopIndex >= GRID_SIZE - 1;
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
        columnCount={GRID_SIZE}
        rowCount={GRID_SIZE}
        columnWidth={cellSize}
        rowHeight={cellSize}
        height={windowDimensions.height}
        width={windowDimensions.width}
        initialScrollTop={
          Math.floor(GRID_SIZE / 2) * cellSize -
          windowDimensions.height / 2 +
          halfCellSize
        }
        initialScrollLeft={
          Math.floor(GRID_SIZE / 2) * cellSize -
          windowDimensions.width / 2 +
          halfCellSize
        }
        onScroll={handleScroll}
        onItemsRendered={handleItemsRendered}
        itemData={{ originX, originY }}
      >
        {Cell}
      </Grid>
      <button
        className="btn absolute bottom-8 right-8"
        onClick={() => navigateToXY(0, 0)}
      >
        Go to Center
      </button>
    </>
  );
};

export default InfiniteGrid;
