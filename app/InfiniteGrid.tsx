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
import axios from "axios";

export const GRID_SIZE = 2001; // Maintain a fixed size
export const SCROLL_THRESHOLD = 1; // 1000 pixels per second

export interface Listing {
  chain_id: number;
  domain_name: string;
  domain_version: string;
  end_time: number;
  ethscription_id: string;
  listing_id: string;
  price: string;
  seller: string;
  signature: string;
  start_time: number;
  verifying_contract: string;
}

const InfiniteGrid: React.FC = () => {
  const searchParams = useSearchParams();
  const [originX, setOriginX] = useState(0);
  const [originY, setOriginY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const initialPinchDistance = useRef<number | null>(null);
  const [refreshCell, setRefreshCell] = useState(0);
  const currentScroll = useRef<GridOnScrollProps>();
  const [windowDimensions, setWindowDimensions] = useState({
    height: 0,
    width: 0,
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
  const [listings, setListings] = useState<Listing[]>([]);
  const [resizing, setResizing] = useState(false);
  const prevWindowDimensions = useRef({
    height: 0,
    width: 0,
  });
  const prevZoom = useRef(1);

  const plot = useMemo(
    () => searchParams.get("plot") as string,
    [searchParams]
  );

  const cellSizeWithoutZoom =
    (windowDimensions.height > windowDimensions.width
      ? windowDimensions.width
      : windowDimensions.height) / 4;
  const cellSize = cellSizeWithoutZoom * zoom;
  const halfCellSize = cellSize / 2;

  useEffect(() => {
    if (resizing) {
      const timeout = setTimeout(() => setResizing(false), 250);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [resizing]);

  const navigateToXY = useCallback((x: number, y: number) => {
    setOriginX(x);
    setOriginY(-y);
    gridRef.current?.scrollToItem({
      columnIndex: Math.floor(GRID_SIZE / 2),
      rowIndex: Math.floor(GRID_SIZE / 2),
      align: "center",
    });
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      keysPressed.current[event.key.toLowerCase()] = true; // set the key as pressed

      if (currentScroll.current && gridRef.current) {
        let currentScrollTop = currentScroll.current.scrollTop;
        let currentScrollLeft = currentScroll.current.scrollLeft;

        const newScroll = {
          scrollTop: currentScrollTop,
          scrollLeft: currentScrollLeft,
        };

        if (keysPressed.current["w"] || keysPressed.current["arrowup"]) {
          setIsScrollingFast(true);
          newScroll.scrollTop = currentScrollTop - cellSize / 2;
        }

        if (keysPressed.current["s"] || keysPressed.current["arrowdown"]) {
          setIsScrollingFast(true);
          newScroll.scrollTop = currentScrollTop + cellSize / 2;
        }

        if (keysPressed.current["a"] || keysPressed.current["arrowleft"]) {
          setIsScrollingFast(true);
          newScroll.scrollLeft = currentScrollLeft - cellSize / 2;
        }

        if (keysPressed.current["d"] || keysPressed.current["arrowright"]) {
          setIsScrollingFast(true);
          newScroll.scrollLeft = currentScrollLeft + cellSize / 2;
        }

        gridRef.current.scrollTo(newScroll);
      }
    },
    [cellSize]
  );

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    keysPressed.current[event.key.toLowerCase()] = false; // unset the key

    if (
      [
        "w",
        "s",
        "a",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(event.key.toLowerCase())
    ) {
      setIsScrollingFast(false);
      setRefreshCell((refresh) => (refresh += 1));
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  useEffect(() => {
    (async () => {
      const listingsRes = await axios.get(
        "https://api.ethscriptions.com/api/listings"
      );
      setListings(listingsRes.data.valid as Listing[]);
    })();
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
      setResizing(true);
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
        console.log("shouldNavigate");
        navigateToXY(columnInMiddle, rowInMiddle);
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
    }
  };

  const centerAndZoomScroll = useCallback(
    (newZoom: number, oldZoom: number) => {
      if (currentScroll.current && gridRef.current) {
        const center = {
          x: currentScroll.current.scrollLeft + windowDimensions.width / 2,
          y: currentScroll.current.scrollTop + windowDimensions.height / 2,
        };
        const newCenter = {
          x: (center.x * newZoom) / oldZoom,
          y: (center.y * newZoom) / oldZoom,
        };
        const scrollLeft = newCenter.x - windowDimensions.width / 2;
        const scrollTop = newCenter.y - windowDimensions.height / 2;

        gridRef.current.scrollTo({ scrollLeft, scrollTop });
      }
    },
    [windowDimensions.height, windowDimensions.width]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (
        dimensionsInitialized &&
        currentScroll.current &&
        gridRef.current &&
        (windowDimensions.height !== prevWindowDimensions.current.height ||
          windowDimensions.width !== prevWindowDimensions.current.width ||
          zoom === prevZoom.current)
      ) {
        if (
          prevWindowDimensions.current.height &&
          prevWindowDimensions.current.width
        ) {
          const oldCellSize =
            (prevWindowDimensions.current.height >
            prevWindowDimensions.current.width
              ? prevWindowDimensions.current.width
              : prevWindowDimensions.current.height) / 3;
          const newCellSize =
            (windowDimensions.height > windowDimensions.width
              ? windowDimensions.width
              : windowDimensions.height) / 3;
          const currentScrollLeft = currentScroll.current.scrollLeft;
          const currentScrollTop = currentScroll.current.scrollTop;
          const sizeChange =
            (newCellSize * zoom) / (oldCellSize * prevZoom.current);
          const newScrollLeft = currentScrollLeft * sizeChange;
          const newScrollTop = currentScrollTop * sizeChange;

          gridRef.current.scrollTo({
            scrollLeft: newScrollLeft,
            scrollTop: newScrollTop,
          });
        }
        prevWindowDimensions.current = windowDimensions;
      } else {
        prevZoom.current = zoom;
      }
    }, 200);
    return () => {
      clearTimeout(timeout);
    };
  }, [dimensionsInitialized, windowDimensions, zoom]);

  // Event handler to zoom in
  const zoomIn = useCallback(() => {
    const newZoom = Math.min(2, zoom + 0.2);
    setResizing(true);
    centerAndZoomScroll(newZoom, zoom);
    setZoom(newZoom);
  }, [centerAndZoomScroll, zoom]);

  // Event handler to zoom out
  const zoomOut = useCallback(() => {
    const newZoom = Math.max(0.5, zoom - 0.2);
    setResizing(true);
    centerAndZoomScroll(newZoom, zoom);
    setZoom(newZoom);
  }, [centerAndZoomScroll, zoom]);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      // Zooming if Command (or Control) key is pressed
      if (event.metaKey || event.ctrlKey) {
        if (event.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
        event.preventDefault();
      }
      // Scrolling is allowed to propagate naturally if Command (or Control) key is not pressed
    },
    [zoomIn, zoomOut]
  );

  // Event handlers to listen to zooming commands
  useEffect(() => {
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  const handleTouchStart = useCallback((event: TouchEvent) => {
    if (event.touches.length === 2) {
      initialPinchDistance.current = Math.hypot(
        event.touches[0].pageX - event.touches[1].pageX,
        event.touches[0].pageY - event.touches[1].pageY
      );
    }
  }, []);

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (event.touches.length === 2 && initialPinchDistance.current) {
        const newDistance = Math.hypot(
          event.touches[0].pageX - event.touches[1].pageX,
          event.touches[0].pageY - event.touches[1].pageY
        );
        const difference = newDistance - initialPinchDistance.current;

        if (Math.abs(difference) >= 10) {
          // Change this threshold as per your requirement
          if (difference > 0) {
            zoomIn();
          } else {
            zoomOut();
          }
          initialPinchDistance.current = newDistance;
        }
        event.preventDefault();
      }
    },
    [zoomIn, zoomOut]
  );

  const handleTouchEnd = useCallback(() => {
    initialPinchDistance.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

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
        itemData={{
          originX,
          originY,
          listings,
          refreshCell,
          resizing,
          cellSize,
        }}
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
