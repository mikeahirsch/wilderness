import { useState, useEffect, CSSProperties } from "react";
import { GridChildComponentProps } from "react-window";
import { Ethscription, fetchQueue } from "./fetchEthscription";
import { ethAddressToColor } from "./utils";
import { GRID_SIZE } from "./InfiniteGrid";

interface CellProps extends GridChildComponentProps {
  data: {
    originX: React.MutableRefObject<number>;
    originY: React.MutableRefObject<number>;
  };
}

export const Cell: React.FC<CellProps> = ({
  columnIndex,
  rowIndex,
  style,
  data,
}) => {
  const x = columnIndex + data.originX.current - Math.floor(GRID_SIZE / 2);
  const y = rowIndex + data.originY.current - Math.floor(GRID_SIZE / 2);

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
