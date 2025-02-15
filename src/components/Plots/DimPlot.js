import React, { useEffect, useRef, useContext, useState } from 'react';
import {
    ControlGroup, Button, Icon, ButtonGroup, Callout, RangeSlider,
    Divider, Label, Tag, HTMLSelect, Switch
} from "@blueprintjs/core";
import { Tooltip2 } from "@blueprintjs/popover2";

import { AppContext } from '../../context/AppContext';
import { getMinMax } from './utils';

import Rainbow from './rainbowvis';
import { randomColor } from 'randomcolor';
import { palette } from './utils';

import "./DimPlot.css";
import { AppToaster } from "../Spinners/AppToaster";

import WebGLVis from 'epiviz.gl';

const DimPlot = (props) => {
    const container = useRef();
    const selector = useRef();

    // ref to the plot object
    const [scatterplot, setScatterplot] = useState(null);
    // get closestpoint on viz, to highlight the cluster
    const [clusHover, setClusHover] = useState(null);
    // show a gradient on the plot ?
    const [showGradient, setShowGradient] = useState(false);
    // expression min & max
    const [exprMinMax, setExprMinMax] = useState(null);
    // user selected min and max from UI
    const [sliderMinMax, setSliderMinMax] = useState(exprMinMax);
    // gradient scale
    const [gradient, setGradient] = useState(null);
    // first render ?
    const [renderCount, setRenderCount] = useState(true);

    const { genesInfo, geneColSel, annotationCols, annotationObj } = useContext(AppContext);

    // set mode for plot
    const [plotMode, setPlotMode] = useState('PAN');

    // choose between categorical vs gradient factors on numerical arrays
    const [toggleFactorsGradient, setToggleFactorsGradient] = useState(true);
    // show the toggle
    const [showToggleFactors, setShowToggleFactors] = useState(false);
    // the gradient
    const [factorGradient, setFactorGradient] = useState(null);
    const [factorsMinMax, setFactorsMinMax] = useState(null);
    // capture state across annotations
    const [factorState, setFactorState] = useState({});

    // dim plot color mappins & groups
    const [plotColorMappings, setPlotColorMappings] = useState(null);
    const [plotGroups, setPlotGroups] = useState(null);
    const [plotFactors, setPlotFactors] = useState(null);

    const [cellColorArray, setCellColorArray] = useState(null);
    const [spec, setSpec] = useState(null);
    // const [resizeObserver, setResizeObserver] = useState(null);

    // const [resizeTimeout, setResizeTimeout] = useState(null);
    let resizeTimeout, resizeObserver;

    const max = getMinMax(props?.clusterData.clusters)[1] + 1;

    // if either gene or expression changes, compute gradients and min/max
    useEffect(() => {
        if (props?.gene === null) {
            setShowGradient(false);
            setGradient(null);
        }

        let index = props?.selectedClusterIndex?.[props?.gene];
        let expr = props?.selectedClusterSummary?.[index]?.expr;

        if (expr) {
            let exprMinMax = getMinMax(expr);
            let val = exprMinMax[1] === 0 ? 0.01 : exprMinMax[1];
            let tmpgradient = new Rainbow();
            tmpgradient.setSpectrum('#F5F8FA', "#2965CC");
            tmpgradient.setNumberRange(0, val);
            if (exprMinMax[0] !== exprMinMax[1]) {
                setShowGradient(true);
                setSliderMinMax([0, val]);
                setExprMinMax([0, val]);
            } else {
                setShowGradient(false);
                AppToaster.show({ icon: "warning-sign", intent: "warning", message: `${genesInfo[geneColSel][props?.gene]} is not expressed in any cell (mean = 0)` })
            }
            setGradient(tmpgradient);
        }
    }, [props?.selectedClusterIndex?.[props?.gene],
    props?.selectedClusterSummary?.[props?.selectedClusterIndex?.[props?.gene]]?.expr,
    props?.gene]);

    // hook to also react when user changes the slider
    useEffect(() => {

        if (Array.isArray(sliderMinMax)) {
            let tmpgradient = new Rainbow();
            tmpgradient.setSpectrum('#F5F8FA', "#2965CC");
            tmpgradient.setNumberRange(...sliderMinMax);
            setGradient(tmpgradient);
            setShowGradient(true);
        }

    }, [sliderMinMax]);

    useEffect(() => {
        const containerEl = container.current;

        if (containerEl) {

            let data = null;

            if (props?.showAnimation) {
                data = props?.animateData;
            } else {
                if (props?.defaultRedDims === "TSNE") {
                    data = props?.tsneData;
                } else if (props?.defaultRedDims === "UMAP") {
                    data = props?.umapData;
                }
            }

            // if dimensions are available
            if (data && plotFactors && plotColorMappings) {

                const cluster_mappings = plotFactors;
                const cluster_colors = plotColorMappings;
                
                let tmp_scatterplot = scatterplot;
                // only create the plot object once
                if (!tmp_scatterplot) {
                    const containerEl = container.current;

                    tmp_scatterplot = new WebGLVis(containerEl);
                    tmp_scatterplot.addToDom();
                    setScatterplot(tmp_scatterplot);
                }

                tmp_scatterplot.dataWorker.onmessage = (message) => {
                    if (message.data.type === "getClosestPoint") {
                      if (message.data.closestPoint === undefined) {
                        return;
                      }
                      let hdata = message.data;
                        if (hdata?.distance <= 1.5) {
                            setClusHover(cluster_mappings[hdata?.indices?.[0]]);
                        } else {
                            setClusHover(null);
                        }
                    } else if (message.data.type === "getClickPoint") {
                      if (message.data.closestPoint === undefined) {
                        return;
                      }
                      let hdata = message.data;
                        if (hdata?.distance <= 1.5) {
                            if (props?.clusHighlight == cluster_mappings[hdata?.indices?.[0]]) {
                                props?.setClusHighlight(null);
                                props?.setClusHighlightLabel(null);
                                props?.setHighlightPoints(null);
                            } else {
                                props?.setClusHighlight(cluster_mappings[hdata?.indices?.[0]]);
                                props?.setClusHighlightLabel(plotGroups[cluster_mappings[hdata?.indices?.[0]]]);
                                let clus_indices=[];
                                for (let i=0;i<plotFactors.length;i++) {
                                    if (cluster_mappings[hdata?.indices?.[0]] == plotFactors[i]) {
                                        clus_indices.push(i);
                                    }
                                }
                                props?.setHighlightPoints(clus_indices);
                            }
                        } else {
                            props?.setClusHighlight(null);
                            props?.setClusHighlightLabel(null);
                            props?.setHighlightPoints(null);
                        }
                    } else if (
                      message.data.type === "selectBox" ||
                      message.data.type === "selectLasso"
                    ) {
                        message.data.selection?.indices.length > 0 && props?.setSelectedPoints(message.data.selection?.indices);
                        tmp_scatterplot.dataWorker.dataWorkerStream.push(message);
                    }
                }

                // coloring cells on the plot
                // by default chooses the cluster assigned color for the plot
                // if a gradient bar is available, sets gradient 
                // if a cluster is highlighted, grays out all other cells except the cells
                // in the cluster or selection
                // priority of rendering
                // gradient selection > cluster selection > graying out
                // an initial implementation also used a per cluster gradient to color cells
                // by expression, commmented out
                let plot_colors = [];
                for (let i = 0; i < data.x.length; i++) {
                    if (props?.selectedPoints && props?.selectedPoints.length > 0) {

                        if (props?.selectedPoints.includes(i)) {
                            plot_colors[i] = cluster_colors[cluster_mappings[i]];
                        } else {
                            plot_colors[i] = "#EDEFF2";
                        }

                        continue;
                    }

                    if (props?.clusHighlight != null) {
                        if (!String(props?.clusHighlight).startsWith("cs")) {
                            if (props?.clusHighlight !== cluster_mappings[i]) {
                                plot_colors[i] = '#D3D3D3';
                                continue;
                            }
                        } else {
                            if (!props?.customSelection[props?.clusHighlight].includes(i)) {
                                plot_colors[i] = '#D3D3D3';
                                continue;
                            }
                        }
                    }

                    if (props?.gene !== null) {
                        let index = props?.selectedClusterIndex?.[props?.gene];
                        let expr = props?.selectedClusterSummary?.[index]?.expr;

                        if (Array.isArray(expr)) {
                            plot_colors[i] = "#" + gradient.colorAt(expr?.[i]);
                            continue;
                            // if we want per cell gradient 
                            // let colorGradients = cluster_colors.map(x => {
                            //     var gradient = new Rainbow();
                            //     gradient.setSpectrum('#D3D3D3', x);
                            //     let val = exprMinMax[1] === 0 ? 0.01 : exprMinMax[1];
                            //     gradient.setNumberRange(0, val);
                            //     return gradient;
                            // });

                            // return "#" + colorGradients[cluster_mappings[i]].colorAt(props?.selectedClusterSummary?.[gene]?.expr?.[i])
                        }
                    }

                    if (props?.clusHighlight != null && String(props?.clusHighlight).startsWith("cs")) {
                        let tmpclus = parseInt(props?.clusHighlight.replace("cs", ""));
                        plot_colors[i] = cluster_colors[max + tmpclus - 1];
                    } else {
                        if (showToggleFactors) {
                            if (toggleFactorsGradient && factorGradient) {
                                plot_colors[i] = "#" + factorGradient.colorAt(parseFloat(cluster_mappings[i]));
                                continue;
                            }
                        }
                        plot_colors[i] = cluster_colors[cluster_mappings[i]];
                    }
                }

                setCellColorArray(plot_colors);

                let xMinMax = getMinMax(data.x);
                let yMinMax = getMinMax(data.y);
                let xDomain = [(xMinMax[0] - (Math.abs(0.25 * xMinMax[0]))), (xMinMax[1] + (Math.abs(0.25 * xMinMax[1])))];
                let yDomain = [(yMinMax[0] - (Math.abs(0.25 * yMinMax[0]))), (yMinMax[1] + (Math.abs(0.25 * yMinMax[1])))];

                let aspRatio = containerEl.clientWidth / containerEl.clientHeight;

                let xBound = Math.max(...xDomain.map(a => Math.abs(a)));
                let yBound = Math.max(...yDomain.map(a => Math.abs(a)));

                if (aspRatio > 1) {
                    xBound = xBound * aspRatio;
                } else {
                    yBound = yBound / aspRatio;
                }

                let tspec = {
                    defaultData: {
                        x: data.x,
                        y: data.y,
                        color: plot_colors,
                    },
                    xAxis: 'none',
                    yAxis: 'none',
                    tracks: [
                        {
                            mark: 'point',
                            x: {
                                attribute: 'x',
                                type: 'quantitative',
                                domain: [-xBound, xBound],
                            },
                            y: {
                                attribute: 'y',
                                type: 'quantitative',
                                domain: [-yBound, yBound],
                            },
                            color: {
                                attribute: 'color',
                                type: 'inline',
                            },
                            size: { value: 3 },
                            opacity: { value: 0.8 },
                        },
                    ],
                };

                setSpec(tspec);

                function updatePlot() {
                    let uspec = {...tspec};

                    tmp_scatterplot.setCanvasSize(
                        containerEl.parentNode.clientWidth,
                        containerEl.parentNode.clientHeight
                    );

                    aspRatio = containerEl.clientWidth / containerEl.clientHeight;

                    xBound = Math.max(...xDomain.map(a => Math.abs(a)));
                    yBound = Math.max(...yDomain.map(a => Math.abs(a)));

                    if (aspRatio > 1) {
                        xBound = xBound * aspRatio;
                    } else {
                        yBound = yBound / aspRatio;
                    }

                    uspec["tracks"][0].x.domain = [-xBound, xBound];
                    uspec["tracks"][0].y.domain = [-yBound, yBound];

                    tmp_scatterplot.setSpecification(uspec);
                    setSpec(uspec);
                }

                if (window.scatterplotresizeObserver) {
                    window.scatterplotresizeObserver.disconnect();
                }

                window.scatterplotresizeObserver = new ResizeObserver(() => {
                    // props?.setGene(null);
                    // setShowToggleFactors(false);
                    // setFactorsMinMax(null);
                    // props?.setClusHighlight(null);
                    // props?.setHighlightPoints(null);
                    // props?.setClusHighlightLabel(null);
                    updatePlot();
                });

                window.scatterplotresizeObserver.observe(containerEl);
                if (renderCount) {
                    tmp_scatterplot.setSpecification(tspec);
                    setRenderCount(false);
                    // setResizeObserver(tresizeObserver);

                    // window.addEventListener("resize", function() {
                    //     // similar to what we do in epiviz
                    //     // if (resizeTimeout) {
                    //     //     clearTimeout(resizeTimeout);
                    //     // }
    
                    //     // resizeTimeout = setTimeout(function(){ 
                    //     //     console.log("inside window resize ?");
                    //     //     updatePlot()
                    //     // }.bind(self), 500);
                    //     // updatePlot.bind(self)();
                    // }.bind(self));
                } else {
                    tmp_scatterplot.setSpecification(tspec);
                }
            }
        }
    }, [props?.tsneData, props?.umapData, props?.animateData, props?.defaultRedDims,
        gradient, props?.clusHighlight, plotColorMappings, plotGroups, plotFactors, showToggleFactors,
    props?.selectedPoints]);

    useEffect(() => {
        if (props?.colorByAnnotation.toLowerCase() == "clusters") {

            setPlotColorMappings(props?.clusterColors);
            let clus_names = [];
            for (let i = 0; i < max; i++) {
                clus_names.push(`Cluster ${i + 1}`);
            }
            setPlotGroups(clus_names);
            setPlotFactors(props?.clusterData?.clusters);
        } else {
            if (!(props?.colorByAnnotation in annotationObj)) {
                props?.setReqAnnotation(props?.colorByAnnotation);
            } else {
                let tmp = annotationObj[props?.colorByAnnotation];
                let cluster_colors;

                if (tmp.type === "array") {

                    let state = factorState[props?.colorByAnnotation];
                    if (state == undefined || state == null) {
                        state = true;
                    }
                    setToggleFactorsGradient(state);

                    setShowToggleFactors(true);

                    // convert array to factors
                    const [minTmp, maxTmp] = getMinMax(tmp.values);
                    setFactorsMinMax([minTmp, maxTmp]);
                    const uniqueTmp = [...new Set(tmp.values)];
                    let bins = 25;

                    let type = "ranges";
                    let binWidth = 1;
                    let levels = [];
                    if (uniqueTmp.length < bins) {
                        type = "unique";
                        bins = uniqueTmp.length;
                    } else if (maxTmp - minTmp < bins) {
                        type = "diff";
                        bins = maxTmp - minTmp
                    }

                    if (type == "ranges") {
                        binWidth = Math.round((maxTmp - minTmp) / bins);
                    }

                    for (let i = 0; i < bins; i++) {
                        if (type === "ranges") {
                            levels.push(`∈[${minTmp + ((i + 1) * binWidth)}, ${minTmp + ((i + 2) * binWidth)}]`)
                        } else if (type == "unique") {
                            levels.push(`${uniqueTmp[i]}`)
                        } else if (type == "diff") {
                            levels.push(`${minTmp + ((i + 1) * binWidth)}`)
                        }
                    }

                    let lvals = [];
                    tmp.values.map((x, i) => {
                        let flevel = (x - minTmp);
                        if (type === "ranges") {
                            flevel = (x - minTmp) % bins;
                        } else if (type === "unique") {
                            flevel = levels.indexOf(String(x));
                        }
                        lvals.push(flevel);
                    });

                    if (toggleFactorsGradient && showToggleFactors) {
                        let tmpgradient = new Rainbow();
                        tmpgradient.setSpectrum("#edc775", "#e09351", "#df7e66", "#b75347", "#6d2f20");
                        tmpgradient.setNumberRange(minTmp, maxTmp);
                        setFactorGradient(tmpgradient);
                    }

                    setPlotGroups(levels);

                    if (levels.length > Object.keys(palette).length) {
                        cluster_colors = randomColor({ luminosity: 'dark', count: levels.length + 1 });
                    } else {
                        cluster_colors = palette[levels.length.toString()];
                    }

                    setPlotColorMappings(cluster_colors);

                    if (toggleFactorsGradient) {
                        setPlotFactors(tmp.values);
                    } else {
                        setPlotFactors(lvals);
                    }

                } else if (tmp.type === "factor") {
                    setShowToggleFactors(false);

                    if (tmp.levels.length > Object.keys(palette).length) {
                        cluster_colors = randomColor({ luminosity: 'dark', count: tmp.levels.length + 1 });
                    } else {
                        cluster_colors = palette[tmp.levels.length.toString()];
                    }

                    setPlotGroups(tmp.levels);
                    setPlotColorMappings(cluster_colors);
                    setPlotFactors(tmp.index);
                }
            }
        }
    }, [props?.colorByAnnotation, annotationObj, props?.clusterData, props?.clusterColors,
        showToggleFactors, toggleFactorsGradient]);

    const setInteraction = (x) => {
        if (x === "SELECT") {
            scatterplot.setViewOptions({ tool: "lasso" });
            setPlotMode("SELECT");
        } else {
            scatterplot.setViewOptions({ tool: "pan" });
            setPlotMode("PAN");
        }
    }

    const clearPoints = () => {
        props?.setSelectedPoints(null);
        scatterplot.clearSelection();
    }

    // save use selected selection of cells
    const savePoints = () => {
        // generate random color
        let color = randomColor({ luminosity: 'dark', count: 1 });
        let tmpcolor = [...props?.clusterColors];
        tmpcolor.push(color[0]);
        props?.setClusterColors(tmpcolor);
        setPlotColorMappings(tmpcolor);

        let cid = Object.keys(props?.customSelection).length;
        let tmpSelection = { ...props?.customSelection };
        tmpSelection[`cs${cid + 1}`] = props?.selectedPoints;
        props?.setCustomSelection(tmpSelection);

        props?.setSelectedPoints(null);
        scatterplot.clearSelection();
    }

    // hook to restore state
    useEffect(() => {
        if (props?.restoreState) {
            let {config} = props?.restoreState;
            if (config) {
                props?.setDefaultRedDims(config?.embedding);
                props?.setClusHighlight(config?.highlight);
                // props?.setClusHighlightLabel(null);
                props?.setGene(config?.gene);

                if (config?.annotation) {
                    props?.setColorByAnnotation(config?.annotation);
                    if (config?.annotation === "clusters") {
                        // set ref to HTMLSelect
                        selector.current.value = "CLUSTERS";
                    } else {
                        selector.current.value = config?.annotation;
                    }
                } else {
                    props?.setColorByAnnotation("clusters");
                    // set ref to HTMLSelect
                    selector.current.value = "CLUSTERS";
                }

                selector.current.dispatchEvent(new Event('change'));
                // other state based changes
                setShowToggleFactors(false);
                setFactorsMinMax(null);
                props?.setClusHighlight(null);
                // props?.setClusHighlightLabel(null);

                let state = factorState[props?.colorByAnnotation];
                if (state == undefined || state == null) {
                    state = true;
                }
                setToggleFactorsGradient(state);
            }
        }
    }, [props?.restoreState]);

    function handleSaveEmbedding() {
        const containerEl = container.current;
        if (containerEl) {
            // const iData = scatterplot.canvas.toDataURL();

            let tmp = [...props?.savedPlot];

            tmp.push({
                "color": cellColorArray,
                "config": {
                    "embedding": JSON.parse(JSON.stringify(props?.defaultRedDims)),
                    "annotation": JSON.parse(JSON.stringify(props?.colorByAnnotation)),
                    "highlight": plotGroups[props?.clusHighlight] ? JSON.parse(JSON.stringify(plotGroups[props?.clusHighlight])): plotGroups[props?.clusHighlight],
                    "gene": props?.gene ? JSON.parse(JSON.stringify(genesInfo[geneColSel][props?.gene])): props?.gene
                }
            });

            props?.setSavedPlot(tmp);
        }
    }

    useEffect(() => {
        if (props?.clusHighlight) {
            if (plotFactors) {
                let clus_indices=[];
                for (let i=0;i<plotFactors.length;i++) {
                    if (props?.clusHighlight == plotFactors[i]) {
                        clus_indices.push(i);
                    }
                }
                props?.setHighlightPoints(clus_indices);
            }
        } else {
            props?.setHighlightPoints(null);
        }
    }, [props?.clusHighlight]);

    return (
        <div className="scatter-plot">
            <ButtonGroup style={{ minWidth: 75, minHeight: 150 }}
                fill={false}
                large={false}
                minimal={false}
                vertical={true}
                className='left-sidebar'
            >
                <Button className='dim-button'
                    disabled={props?.redDims.indexOf("TSNE") === -1}
                    onClick={() => props?.setDefaultRedDims("TSNE")}
                    intent={props?.defaultRedDims === "TSNE" ? "primary" : ""}
                >
                    <Icon icon="heatmap"></Icon>
                    <br />
                    <span>t-SNE</span>
                </Button>
                <Button className='dim-button'
                    disabled={props?.redDims.indexOf("UMAP") === -1}
                    onClick={() => props?.setDefaultRedDims("UMAP")}
                    intent={props?.defaultRedDims === "UMAP" ? "primary" : ""}
                >
                    <Icon icon="heatmap"></Icon><br />
                    <span>UMAP</span>
                </Button>
                <Button className='dim-button'
                    disabled={true}
                >
                    <Icon icon="heat-grid"></Icon>
                    <br />
                    <span>HEATMAP (coming soon)</span>
                </Button>
            </ButtonGroup>
            <div className="top-header">
                <ControlGroup fill={false} vertical={false}
                    style={{
                        marginRight: '4px'
                    }}>
                    <Tooltip2 content="Interactively visualize embeddings">
                        <Button icon="play"
                            onClick={() => {
                                props?.setShowAnimation(true);
                                props?.setTriggerAnimation(true);
                            }}>Animate</Button>
                    </Tooltip2>
                    <Tooltip2 content="Save this embedding">
                        <Button icon="inheritance"
                            onClick={handleSaveEmbedding}>Save</Button>
                    </Tooltip2>
                </ControlGroup>
                <ControlGroup fill={false} vertical={false}>
                    <Button active={plotMode === "PAN"}
                        intent={plotMode === "PAN" ? "primary" : "none"}
                        icon="hand-up" onClick={x => setInteraction("PAN")}>Pan</Button>
                    <Button active={plotMode === "SELECT"}
                        intent={plotMode === "SELECT" ? "primary" : "none"}
                        icon="widget" onClick={x => setInteraction("SELECT")}>Selection</Button>
                </ControlGroup>
            </div>
            {
                props?.showAnimation ?
                    <Label className='iter'>Iteration: {props?.animateData?.iteration}</Label>
                    : ""
            }
            <div className='dim-plot'>
                {
                    props?.defaultRedDims ?
                        <div ref={container} style={{
                            width: "95%",
                            height: "95%"
                        }}></div> :
                        "Choose an Embedding... or Embeddings are being computed..."
                }
            </div>
            <div className='right-sidebar'>
                {
                    <div className='right-sidebar-cluster'>
                        <Callout>
                            <p>NOTE: Clusters identified by Kana can be found under <strong>CLUSTERS</strong></p>
                            <div style={{
                                display: "flex",
                                flexDirection: "row",
                                flexWrap: "wrap"
                            }}>
                                <HTMLSelect elementRef={selector} large={false} minimal={true} defaultValue={"CLUSTERS"}
                                    onChange={(nval, val) => {
                                        props?.setColorByAnnotation(nval?.currentTarget?.value);
                                        setShowToggleFactors(false);
                                        setFactorsMinMax(null);
                                        props?.setClusHighlight(null);
                                        props?.setHighlightPoints(null);
                                        props?.setClusHighlightLabel(null);

                                        let state = factorState[props?.colorByAnnotation];
                                        if (state == undefined || state == null) {
                                            state = true;
                                        }
                                        setToggleFactorsGradient(state);
                                    }}>
                                    {
                                        annotationCols.map((x, i) => (
                                            <option key={i}>{x}</option>
                                        ))
                                    }
                                </HTMLSelect>
                                {
                                    showToggleFactors && <Switch large={false} inline={true} checked={toggleFactorsGradient}
                                        innerLabelChecked="yes" innerLabel="no"
                                        label='show gradient ?'
                                        onChange={(e) => {
                                            setToggleFactorsGradient(e.target.checked);
                                            let tmpState = { ...factorState };
                                            tmpState[props?.colorByAnnotation] = e.target.checked;
                                            setFactorState(tmpState);
                                            props?.setClusHighlight(null);
                                            props?.setHighlightPoints(null);
                                            props?.setClusHighlightLabel(null);
                                        }} />
                                }
                            </div>
                            {
                                showToggleFactors && toggleFactorsGradient ?
                                    <div className='dim-slider-container'>
                                        <div className='dim-slider-gradient'>
                                            <span style={{
                                                marginRight: "3px",
                                                marginTop: "0px"
                                            }}>{Math.round(factorsMinMax[0])}</span>
                                            <div
                                                style={{
                                                    backgroundImage: `linear-gradient(to right, #edc775, #e09351, #df7e66, #b75347, #6d2f20)`,
                                                    width: '175px', height: '15px',
                                                }}></div>&nbsp;
                                            <span style={{
                                                marginLeft: "3px",
                                                marginTop: "0px"
                                            }}>{Math.round(factorsMinMax[1])}</span>
                                        </div>
                                    </div>
                                    :
                                    <ul>
                                        {
                                            plotGroups && [...plotGroups].sort((a, b) => a - b).map((x, i) => {
                                                return (
                                                    <li key={i}
                                                        className={clusHover === plotGroups.indexOf(x) || props?.clusHighlight === plotGroups.indexOf(x) ? 'legend-highlight' : ""}
                                                        style={{ color: plotColorMappings[plotGroups.indexOf(x)] }}
                                                        onClick={() => {
                                                            if (plotGroups.indexOf(x) === props?.clusHighlight) {
                                                                props?.setClusHighlight(null);
                                                                props?.setHighlightPoints(null);
                                                                props?.setClusHighlightLabel(null);
                                                            } else {
                                                                let tclus = plotGroups.indexOf(x);
                                                                props?.setClusHighlight(tclus);
                                                                let clus_indices=[];
                                                                for (let i=0;i<plotFactors.length;i++) {
                                                                    if (tclus == plotFactors[i]) {
                                                                        clus_indices.push(i);
                                                                    }
                                                                }
                                                                props?.setHighlightPoints(clus_indices);
                                                                props?.setClusHighlightLabel(x);
                                                            }
                                                        }}
                                                    > {x ? x : "NA"} </li>
                                                )
                                            })
                                        }
                                    </ul>
                            }
                        </Callout>
                        {
                            (Object.keys(props?.customSelection).length > 0 || (props?.selectedPoints && props?.selectedPoints.length > 0)) ?
                                <Callout title="CUSTOM SELECTIONS">
                                    {
                                        (!(showToggleFactors && toggleFactorsGradient)) && 
                                            <div
                                            style={{
                                                paddingTop: '5px'
                                            }}>
                                            <ul>
                                                {Object.keys(props?.customSelection)?.slice(0, 100).map((x, i) => {
                                                    return (<li key={x}
                                                        className={props?.clusHighlight === x ? 'legend-highlight' : ''}
                                                        style={{ color: props?.clusterColors[getMinMax(props?.clusterData.clusters)[1] + 1 + i] }}
                                                    >
                                                        <div style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            flexDirection: 'row'
                                                        }}>
                                                            <span
                                                                style={{
                                                                    alignSelf: 'center'
                                                                }}
                                                                onClick={() => {
                                                                    if (x === props?.clusHighlight) {
                                                                        props?.setClusHighlight(null);
                                                                        props?.setHighlightPoints(null);
                                                                        props?.setClusHighlightLabel(null);
                                                                    } else {
                                                                        props?.setClusHighlight(x);
                                                                        props?.setHighlightPoints(props?.customSelection[x]);
                                                                        props?.setClusHighlightLabel(x);
                                                                    }
                                                                }}>Custom Selection {x.replace("cs", "")}
                                                            </span>
                                                            <Icon
                                                                size={12}
                                                                icon="trash"
                                                                style={{
                                                                    paddingLeft: '2px'
                                                                }}
                                                                onClick={() => {
                                                                    let tmpSel = { ...props?.customSelection };
                                                                    delete tmpSel[x];
                                                                    props?.setCustomSelection(tmpSel);

                                                                    let tmpcolors = [...props?.clusterColors];
                                                                    tmpcolors = tmpcolors.slice(0, tmpcolors.length - 1);
                                                                    props?.setClusterColors(tmpcolors);

                                                                    props?.setDelCustomSelection(x);

                                                                    if (props?.clusHighlight === x) {
                                                                        props?.setClusHighlight(null);
                                                                        props?.setClusHighlightLabel(null);
                                                                    }
                                                                }}></Icon>
                                                        </div>
                                                    </li>)
                                                })}
                                            </ul>
                                        </div>
                                    }
                                    
                                    {
                                        props?.selectedPoints && props?.selectedPoints.length > 0 ?
                                            <div>
                                                <Divider />
                                                <div className='selection-container'>
                                                    <span>{props?.selectedPoints.length} cells selected</span>
                                                    <div className='selection-button-container'>
                                                        <Button small={true} intent='primary'
                                                            onClick={savePoints}>Save</Button>
                                                        <Button small={true}
                                                            onClick={clearPoints}>Clear</Button>
                                                    </div>
                                                </div>
                                            </div>
                                            :
                                            ""
                                    }
                                </Callout>
                                :
                                ""
                        }
                    </div>
                }
                {showGradient ?
                    <div className='right-sidebar-slider'>
                        <Callout>
                            <span>Gradient for <Tag
                                minimal={true}
                                intent='primary' onRemove={() => {
                                    props?.setGene(null);
                                }}>{genesInfo[geneColSel][props?.gene]}</Tag>&nbsp;
                                <Tooltip2 content="Use the slider to adjust the color gradient of the plot. Useful when data is skewed
                                by either a few lowly or highly expressed cells" openOnTargetFocus={false}>
                                    <Icon icon="help"></Icon>
                                </Tooltip2>
                            </span>
                            <div className='dim-slider-container'>
                                <div className='dim-slider-gradient'>
                                    {/* <span>{Math.round(exprMinMax[0])}</span>&nbsp; */}
                                    <div
                                        style={{
                                            backgroundImage: `linear-gradient(to right, #F5F8FA ${(sliderMinMax[0] - exprMinMax[0]) * 100 / (exprMinMax[1] - exprMinMax[0])}%, ${((sliderMinMax[1] + sliderMinMax[0] - (2 * exprMinMax[0]))) * 100 / (2 * (exprMinMax[1] - exprMinMax[0]))}%, #2965CC ${(100 - (exprMinMax[1] - sliderMinMax[1]) * 100 / (exprMinMax[1] - exprMinMax[0]))}%)`,
                                            width: '175px', height: '15px',
                                        }}></div>&nbsp;
                                    {/* <span>{Math.round(exprMinMax[1])}</span> */}
                                </div>
                                <div className='dim-range-slider'>
                                    <RangeSlider
                                        min={Math.round(exprMinMax[0])}
                                        max={Math.round(exprMinMax[1])}
                                        stepSize={Math.round(exprMinMax[1] - exprMinMax[0]) / 10}
                                        labelValues={[Math.round(exprMinMax[0]), Math.round(exprMinMax[1])]}
                                        onChange={(range) => { setSliderMinMax(range) }}
                                        value={[Math.round(sliderMinMax[0]), Math.round(sliderMinMax[1])]}
                                        vertical={false}
                                    />
                                </div>
                            </div>
                        </Callout>
                    </div>
                    :
                    ""
                }
            </div>
        </div>
    );
};

export default React.memo(DimPlot);
