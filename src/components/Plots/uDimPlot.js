import { useEffect, useRef, useState } from "react";
import ScatterGL from "epiviz.scatter.gl";

const UDimPlot = (props) => {
  const container = useRef();
  let data = props?.data;
  const [scatterplot, setScatterplot] = useState(null);

  useEffect(() => {
    const containerEl = container.current;
    if (containerEl && props?.tsneData && props?.umapData) {
      let tmp_scatterplot = scatterplot;
      // only create the plot object once
      if (!tmp_scatterplot) {
        tmp_scatterplot = new ScatterGL(containerEl);
        setScatterplot(tmp_scatterplot);

        tmp_scatterplot.setInteraction("lasso");
        tmp_scatterplot.selectionCallback = function (points) {
          points?.selection?.indices.length > 0 && props?.setSelectedPoints(points?.selection?.indices);
        };
      }

      let rdata;
      if (props?.data?.config?.embedding === "TSNE") {
        rdata = props?.tsneData;
      } else if (props?.data?.config?.embedding === "UMAP") {
        rdata = props?.umapData;
      }

      tmp_scatterplot.setInput({
        x: rdata.x,
        y: rdata.y,
      });

      let color = [];
      if (props?.selectedPoints && props?.selectedPoints.length > 0) {
        for (let i = 0; i < rdata.x.length; i++) {
          if (props?.selectedPoints.includes(i)) {
            color[i] = data?.color[i];
          } else {
            // if (Array.isArray(data?.color)) {
            //   color[i] = data?.color[i];
            // } else {
            //   color[i] = data?.color;
            // }
            color[i] = "#EDEFF2";
          }
        }
      } else {
        tmp_scatterplot.plot.clearSelection();
      }

      if (props?.highlightPoints && props?.highlightPoints.length > 0) {
        for (let i = 0; i < rdata.x.length; i++) {
          if (props?.highlightPoints.includes(i)) {
            color[i] = data?.color[i];
          } else {
            color[i] = "#EDEFF2";
          }
        }
      } else {
        tmp_scatterplot.plot.clearSelection();
      }

      if (color.length == 0) {
        color = data?.color;
      }

      tmp_scatterplot.setState({
        color: color,
      });

      tmp_scatterplot.render();
    }
  }, [props]);

  return (
    <div className="udimplot-container">
      <div className="dim-plot">
        <div
          ref={container}
          style={{
            width: "400px",
            height: "400px",
          }}
        ></div>
      </div>
    </div>
  );
};

export default UDimPlot;
