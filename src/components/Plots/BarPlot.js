import React, { useEffect, useRef } from "react";
import * as d3 from 'd3';
import { saveSVG } from './utils.js';
import { Button } from "@blueprintjs/core";

// a typical d3 bar plot
const BarPlot = (props) => {
    const container = useRef();

    useEffect(() => {
        let data = props?.data;
        let propwidth = props?.width;
        let color = props?.color;
        let ymax = props?.ymax;

        if (!ymax) {
            ymax = Math.max(...data.map((d) => { return d.value; }));
        }

        if (!propwidth) {
            propwidth = 325;
        }

        if (!color) {
            color = "#00B3A4";
        }

        if (!data) return "";

        let containerEl = container.current;
        containerEl.innerHTML = "";

        const margin = { top: 10, right: 30, bottom: 30, left: 40 },
            width = propwidth - margin.left - margin.right,
            height = 200 - margin.top - margin.bottom;

        if (containerEl.querySelector("svg")) {
            containerEl.querySelector("svg").innerHTML = "";
        }

        const svg = d3.select(containerEl)
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform",
                `translate(${margin.left},${margin.top})`);

        var x = d3.scaleBand()
            .range([0, width])
            .domain(data.map((d) => { return d.key; }))
            .padding(0.2);

        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x))
            .selectAll("text")
            .attr("transform", "translate(-10,0)rotate(-45)")
            .style("text-anchor", "end");

        var y = d3.scaleLinear()
            .domain([0, ymax])
            .range([height, 0]);

        svg.append("g")
            .call(d3.axisLeft(y));

        svg.selectAll("bars")
            .data(data)
            .enter()
            .append("rect")
            .attr("x", (d) => { return x(d.key); })
            .attr("y", (d) => { return y(d.value); })
            .attr("width", x.bandwidth())
            .attr("height", (d) => { return height - y(d.value); })
            .attr("fill", (d, i) => {
                if (Array.isArray(color)) {
                    return color[i];
                }
                return color;
            })
    }, [props?.data]);

    return (
        <div className="imgplot-container">
            <Button small={true} className="imgplot-save" icon="download"
                onClick={() => {
                    saveSVG(d3.select(container.current.querySelector("svg")).node(),
                        2 * 325, 2 * 200, props?.filename);
                }}>Download</Button>
            <div ref={container}></div>
        </div>
    );
};

export default React.memo(BarPlot);