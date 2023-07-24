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
import { setIsScrollingFast } from "./fetchEthscriptions";
import { Cell } from "./Cell";
import { useSearchParams } from "next/navigation";

export const GRID_SIZE = 201; // Maintain a fixed size
export const SCROLL_THRESHOLD = 1; // 1000 pixels per second

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
  const lastScrollEventRef = useRef({
    time: Date.now(),
    scrollLeft: 0,
    scrollTop: 0,
  });
  const scrollDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const hasScrolledToRightEdge = useRef(false);
  const hasScrolledToLeftEdge = useRef(false);
  const hasScrolledToTopEdge = useRef(false);
  const hasScrolledToBottomEdge = useRef(false);

  const plot = useMemo(
    () => searchParams.get("plot") as string,
    [searchParams]
  );

  const cellSize = Math.ceil(
    (windowDimensions.height > windowDimensions.width
      ? windowDimensions.width
      : windowDimensions.height) / 3
  );
  const halfCellSize = cellSize / 2;

  const navigateToXY = useCallback((x: number, y: number) => {
    originX.current = x;
    originY.current = -y;
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

  const handleEdge = (
    closeToEdge: boolean,
    hasScrolledToEdgeRef: React.MutableRefObject<boolean>
  ) => {
    let shouldNavigate = false;

    if (closeToEdge && !hasScrolledToEdgeRef.current) {
      shouldNavigate = true;
    } else if (!closeToEdge && hasScrolledToEdgeRef.current) {
      hasScrolledToEdgeRef.current = false;
    }

    return shouldNavigate;
  };

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

    const columnsToMiddle = Math.floor(
      (overscanColumnStopIndex - overscanColumnStartIndex) / 2
    );
    const columnInMiddle =
      overscanColumnStartIndex + columnsToMiddle - Math.floor(GRID_SIZE / 2);
    const rowsToMiddle = Math.floor(
      (overscanRowStopIndex - overscanRowStartIndex) / 2
    );
    const rowInMiddle =
      overscanRowStartIndex + rowsToMiddle - Math.floor(GRID_SIZE / 2);

    if (currentScroll.current && gridRef.current) {
      let shouldNavigate = false;
      shouldNavigate =
        shouldNavigate || handleEdge(closeToTopEdge, hasScrolledToTopEdge);
      shouldNavigate =
        shouldNavigate || handleEdge(closeToLeftEdge, hasScrolledToLeftEdge);
      shouldNavigate =
        shouldNavigate ||
        handleEdge(closeToBottomEdge, hasScrolledToBottomEdge);
      shouldNavigate =
        shouldNavigate || handleEdge(closeToRightEdge, hasScrolledToRightEdge);

      if (shouldNavigate) {
        navigateToXY(rowInMiddle, columnInMiddle);
      }
    }
  };

  const handleScroll = (props: GridOnScrollProps) => {
    currentScroll.current = props;

    // Calculate time elapsed since last scroll event
    const timeElapsed = Date.now() - lastScrollEventRef.current.time;

    // Calculate distance scrolled since last scroll event
    const distanceScrolledX = Math.abs(
      props.scrollLeft - lastScrollEventRef.current.scrollLeft
    );
    const distanceScrolledY = Math.abs(
      props.scrollTop - lastScrollEventRef.current.scrollTop
    );

    // Calculate scrolling speed (pixels per millisecond)
    const speedX = timeElapsed > 0 ? distanceScrolledX / timeElapsed : 0;
    const speedY = timeElapsed > 0 ? distanceScrolledY / timeElapsed : 0;

    // Save current scroll event for next calculation
    lastScrollEventRef.current = {
      time: Date.now(),
      scrollLeft: props.scrollLeft,
      scrollTop: props.scrollTop,
    };

    // Consider it is scrolling only when the speed is above a threshold
    const isScrollingFast =
      speedX > SCROLL_THRESHOLD || speedY > SCROLL_THRESHOLD;

    if (isScrollingFast) {
      // If scrolling fast, clear any existing timeouts
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current);
      }
      setIsScrollingFast(true);
      // If not scrolling fast, set a timeout to set isScrollingFast to false
      // If a new scroll event occurs before the timeout, the timeout will be cancelled
      scrollDebounceRef.current = setTimeout(() => {
        setIsScrollingFast(false);
      }, 200); // Wait 200ms before considering the scrolling has stopped
    } else {
      setIsScrollingFast(false);
    }
  };

  if (!dimensionsInitialized) {
    return null;
  }

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
