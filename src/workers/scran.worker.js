import * as bakana from "bakana";
import * as kana_db from "./KanaDBHandler.js";
import * as downloads from "./DownloadsDBHandler.js";
import * as hashwasm from "hash-wasm";

/***************************************/

function extractBuffers(object, store) {
    if (!object) {
        return;
    }

    if (Array.isArray(object)) {
        for (const element of object) {
            extractBuffers(element, store);
        }
    } else if (object.constructor == Object) {
        for (const [key, element] of Object.entries(object)) {
            extractBuffers(element, store);
        }
    } else if (ArrayBuffer.isView(object)) {
        if (!(object.buffer instanceof ArrayBuffer)) {
            throw "only ArrayBuffers should be in the message payload";
        }
        store.push(object.buffer);
    }
}

function postAttempt(step) {
    postMessage({
        type: `${step}_START`
    });
}

function postSuccess(step, info) {
    if (typeof info == "undefined") {
        postMessage({
            type: `${step}_CACHE`
        });
    } else {
        var transferable = [];
        extractBuffers(info, transferable);
        postMessage({
            type: `${step}_DATA`,
            resp: info
        }, transferable);
    }
}

/***************************************/

let superstate = null;

bakana.setCellLabellingDownload(downloads.get);

bakana.setVisualizationAnimate((type, x, y, iter) => {
    postMessage({
        type: type + "_iter",
        x: x,
        y: y,
        iteration: iter
    }, [x.buffer, y.buffer]);
});

function runAllSteps(inputs, params) {
    // Assembling the giant parameter list.
    let formatted = {
        inputs: {
            sample_factor: inputs.batch
        },
        quality_control: {
            use_mito_default: params.qc["qc-usemitodefault"],
            mito_prefix: params.qc["qc-mito"],
            nmads: params.qc["qc-nmads"]
        },
        normalization: {},
        feature_selection: {
            span: params.fSelection["fsel-span"]
        },
        pca: {
            num_hvgs: params.pca["pca-hvg"],
            num_pcs: params.pca["pca-npc"],
            block_method: params.pca["pca-correction"]
        },
        neighbor_index: {
            approximate: params.cluster["clus-approx"]
        },
        choose_clustering: {
            method: params.cluster["clus-method"]
        },
        tsne: {
            perplexity: params.tsne["tsne-perp"],
            iterations: params.tsne["tsne-iter"],
            animate: params.tsne["animate"]
        },
        umap: {
            num_neighbors: params.umap["umap-nn"],
            num_epochs: params.umap["umap-epochs"],
            min_dist: params.umap["umap-min_dist"],
            animate: params.umap["animate"]
        },
        kmeans_cluster: {
            k: params.cluster["kmeans-k"]
        },
        snn_graph_cluster: {
            k: params.cluster["clus-k"],
            scheme: params.cluster["clus-scheme"],
            resolution: params.cluster["clus-res"]
        },
        markers: {},
        cell_labelling: {
            human_references: params.annotateCells["annotateCells-human_references"],
            mouse_references: params.annotateCells["annotateCells-mouse_references"]
        },
        custom_markers: {}
    };

    return bakana.runAnalysis(superstate, inputs.files, formatted, { startFun: postAttempt, finishFun: postSuccess });
}

/***************************************/

function linkKanaDb(collected) {
    return async (type, name, buffer) => {
        var md5 = await hashwasm.md5(new Uint8Array(buffer));
        var id = type + "_" + name + "_" + buffer.byteLength + "_" + md5;
        var ok = await kana_db.saveFile(id, buffer);
        if (!ok) {
            throw "failed to save file '" + id + "' to KanaDB";
        }
        collected.push(id);
        return id;
    };
}

async function serializeAllSteps(embedded) {
    const h5path = "serialized_in.h5";
    let collected = [];
    let old = bakana.setCreateLink(linkKanaDb(collected));

    let output;
    try {
        let collected = await bakana.saveAnalysis(superstate, h5path, { embedded: embedded });

        if (embedded) {
            output = bakana.createKanaFile(h5path, collected.collected);
        } else {
            output = {
                state: bakana.createKanaFile(h5path, null),
                files: collected
            };
        }
    } finally {
        bakana.removeHDF5File(h5path);
        bakana.setCreateLink(old);
    }

    return output;
}

bakana.setResolveLink(kana_db.loadFile);

async function unserializeAllSteps(contents) {
    const h5path = "serialized_out.h5";

    let output = {};
    try {
        let loader = await bakana.parseKanaFile(contents, h5path);
        let response = await bakana.loadAnalysis(h5path, loader, { finishFun: postSuccess });

        if (superstate !== null) {
            await bakana.freeAnalysis(superstate);
        }
        superstate = response.state;

        let params = response.parameters;
        output = {
            inputs: {
                "batch": params.inputs.sample_factor
            },
            qc: {
                "qc-usemitodefault": params.quality_control.use_mito_default,
                "qc-mito": params.quality_control.mito_prefix,
                "qc-nmads": params.quality_control.nmads
            },
            fSelection: {
                "fsel-span": params.feature_selection.span
            },
            pca: {
                "pca-hvg": params.pca.num_hvgs,
                "pca-npc": params.pca.num_pcs,
                "pca-correction": params.pca.block_method
            },
            cluster: {
                "clus-approx": params.neighbor_index.approximate,
                "kmeans-k": params.kmeans_cluster.k,
                "clus-k": params.snn_graph_cluster.k,
                "clus-scheme": params.snn_graph_cluster.scheme,
                "clus-res": params.snn_graph_cluster.resolution,
                "clus-method": params.choose_clustering.method
            },
            tsne: {
                "tsne-perp": params.tsne.perplexity,
                "tsne-iter": params.tsne.iterations,
                "animate": params.tsne.animate
            },
            umap: {
                "umap-epochs": params.umap.num_epochs,
                "umap-nn": params.umap.num_neighbors,
                "umap-min_dist": params.umap.min_dist,
                "animate": params.umap.animate
            },
            annotateCells: {
                "annotateCells-human_references": params.cell_labelling.human_references,
                "annotateCells-mouse_references": params.cell_labelling.mouse_references
            },
            custom_selections: params.custom_selections
        }
    } finally {
        bakana.removeHDF5File(h5path);
    }

    return output;
}

function postError(type, err, fatal) {
    postMessage({
        type: `${type}_ERROR`,
        resp: {
            reason: err.toString(),
            fatal: fatal
        },
    });
}

/***************************************/



var loaded;
onmessage = function (msg) {
    const { type, payload } = msg.data;
    let fatal = false;
    if (type == "INIT") {
        fatal = true;
        let nthreads = Math.round(navigator.hardwareConcurrency * 2 / 3);
        let back_init = bakana.initialize({ numberOfThreads: nthreads });

        let state_init = back_init
            .then(() => {
                return bakana.createAnalysis()
            });

        state_init
            .then(x => {
                superstate = x;
                postMessage({
                    type: type,
                    msg: "Success: analysis state created"
                });
            });

        let kana_init = kana_db.initialize();
        kana_init
            .then(result => {
                if (result !== null) {
                    postMessage({
                        type: "KanaDB_store",
                        resp: result,
                        msg: "Success: KanaDB initialized"
                    });
                } else {
                    console.error(error);
                    postMessage({
                        type: "KanaDB_ERROR",
                        msg: "Error: Cannot initialize KanaDB"
                    });
                }
            });

        let down_init = downloads.initialize();
        down_init
            .then(result => {
                postMessage({
                    type: "DownloadsDB_store",
                    resp: result,
                    msg: "Success: DownloadsDB initialized"
                });
            })
            .catch(error => {
                console.error(error);
                postMessage({
                    type: "DownloadsDB_ERROR",
                    msg: "Error: Cannot initialize DownloadsDB"
                });
            });


        loaded = Promise.all([
            back_init,
            kana_init,
            down_init,
            state_init
        ]);

        loaded.then(() => {
            postMessage({
                type: type,
                msg: "Success: bakana initialized"
            });
        }).catch(err => {
            console.error(err);
            postError(type, err, fatal)
        });
        /**************** RUNNING AN ANALYSIS *******************/
    } else if (type == "RUN") {
        fatal = true;
        loaded
            .then(x => {
                runAllSteps(payload.inputs, payload.params)
                    .catch(err => {
                        console.error(err);
                        postError(type, err, fatal)
                    });
            }).catch(err => {
                console.error(err);
                postError(type, err, fatal)
            });
        /**************** LOADING EXISTING ANALYSES *******************/
    } else if (type == "LOAD") {
        fatal = true;
        let fs = payload.inputs.files;

        if (fs[Object.keys(fs)[0]].format == "kana") {
            let f = fs[Object.keys(fs)[0]].file;
            loaded
                .then(async (x) => {
                    const reader = new FileReaderSync();
                    let res = reader.readAsArrayBuffer(f);
                    let params = await unserializeAllSteps(res);
                    postMessage({
                        type: "loadedParameters",
                        resp: params
                    });
                }).catch(err => {
                    console.error(err);
                    postError(type, err, fatal)
                });
        } else if (fs[Object.keys(fs)[0]].format == "kanadb") {
            var id = fs[Object.keys(fs)[0]].file;
            kana_db.loadAnalysis(id)
                .then(async (res) => {
                    if (res == null) {
                        postMessage({
                            type: "KanaDB_ERROR",
                            msg: `Fail: cannot load analysis ID '${id}'`
                        });
                    } else {
                        let response = await unserializeAllSteps(res);
                        postMessage({
                            type: "loadedParameters",
                            resp: response
                        });
                    }
                }).catch(err => {
                    console.error(err);
                    postError(type, err, fatal)
                });
        }
        /**************** SAVING EXISTING ANALYSES *******************/
    } else if (type == "EXPORT") {
        loaded
            .then(async (x) => {
                var contents = await serializeAllSteps(true);
                postMessage({
                    type: "exportState",
                    resp: contents,
                    msg: "Success: application state exported"
                }, [contents]);
            }).catch(err => {
                console.error(err);
                postError(type, err, fatal)
            });

    } else if (type == "SAVEKDB") { // save analysis to inbrowser indexedDB 
        var title = payload.title;
        loaded
            .then(async (x) => {
                var contents = await serializeAllSteps(false);
                let id = await kana_db.saveAnalysis(null, contents.state, contents.files, title);
                if (id !== null) {
                    let recs = await kana_db.getRecords();
                    postMessage({
                        type: "KanaDB_store",
                        resp: recs,
                        msg: `Success: Saved analysis to cache (${id})`
                    });
                } else {
                    console.error(error);
                    postMessage({
                        type: "KanaDB_ERROR",
                        msg: `Fail: Cannot save analysis to cache`
                    });
                }
            }).catch(err => {
                console.error(err);
                postError(type, err, fatal)
            });

        /**************** KANADB EVENTS *******************/
    } else if (type == "REMOVEKDB") { // remove a saved analysis
        var id = payload.id;
        kana_db.removeAnalysis(id)
            .then(async (result) => {
                if (result) {
                    let recs = await kana_db.getRecords();
                    postMessage({
                        type: "KanaDB_store",
                        resp: recs,
                        msg: `Success: Removed file from cache (${id})`
                    });
                } else {
                    console.error(error);
                    postMessage({
                        type: "KanaDB_ERROR",
                        msg: `fail: cannot remove file from cache (${id})`
                    });
                }
            }).catch(err => {
                console.error(err);
                postError(type, err, fatal)
            });;

    } else if (type == "PREFLIGHT_INPUT") {
        loaded
            .then(async x => {
                let resp = {};
                try {
                    resp.status = "SUCCESS";
                    resp.details = await bakana.validateAnnotations(payload.inputs.files);
                } catch (e) {
                    resp.status = "ERROR";
                    resp.reason = e.toString();
                }

                postMessage({
                    type: "PREFLIGHT_INPUT_DATA",
                    resp: resp,
                    msg: "Success: PREFLIGHT_INPUT done"
                });
            }).catch(err => {
                console.error(err);
                postError(type, err, fatal)
            });

        /**************** OTHER EVENTS FROM UI *******************/
    } else if (type == "getMarkersForCluster") {
        loaded.then(x => {
            let cluster = payload.cluster;
            let rank_type = payload.rank_type;
            var resp = superstate.marker_detection.fetchGroupResults(cluster, rank_type);

            var transferrable = [];
            extractBuffers(resp, transferrable);
            postMessage({
                type: "setMarkersForCluster",
                resp: resp,
                msg: "Success: GET_MARKER_GENE done"
            }, transferrable);
        }).catch(err => {
            console.error(err);
            postError(type, err, fatal)
        });

    } else if (type == "getGeneExpression") {
        loaded.then(x => {
            let row_idx = payload.gene;
            var vec = superstate.normalization.fetchExpression(row_idx);
            postMessage({
                type: "setGeneExpression",
                resp: {
                    gene: row_idx,
                    expr: vec
                },
                msg: "Success: GET_GENE_EXPRESSION done"
            }, [vec.buffer]);
        }).catch(err => {
            console.error(err);
            postError(type, err, fatal)
        });

    } else if (type == "computeCustomMarkers") {
        loaded.then(x => {
            superstate.custom_selections.addSelection(payload.id, payload.selection);
            postMessage({
                type: "computeCustomMarkers",
                msg: "Success: COMPUTE_CUSTOM_MARKERS done"
            });
        }).catch(err => {
            console.error(err);
            postError(type, err, fatal)
        });

    } else if (type == "getMarkersForSelection") {
        loaded.then(x => {
            let rank_type = payload.rank_type.replace(/-.*/, ""); // summary type doesn't matter for pairwise comparisons.
            var resp = superstate.custom_selections.fetchResults(payload.cluster, rank_type);
            var transferrable = [];
            extractBuffers(resp, transferrable);
            postMessage({
                type: "setMarkersForCustomSelection",
                resp: resp,
                msg: "Success: GET_MARKER_GENE done"
            }, transferrable);
        }).catch(err => {
            console.error(err);
            postError(type, err, fatal)
        });

    } else if (type == "removeCustomMarkers") {
        loaded.then(x => {
            superstate.custom_selections.removeSelection(payload.id);
        }).catch(err => {
            console.error(err);
            postError(type, err, fatal)
        });

    } else if (type == "animateTSNE") {
        loaded.then(async (x) => {
            await superstate.tsne.animate();
            postSuccess("tsne", await superstate.tsne.summary());
        }).catch(err => {
            console.error(err);
            postError(type, err, fatal)
        });

    } else if (type == "animateUMAP") {
        loaded.then(async (x) => {
            await superstate.umap.animate();
            postSuccess("umap", await superstate.umap.summary());
        }).catch(err => {
            console.error(err);
            postError(type, err, fatal)
        });

    } else if (type == "getAnnotation") {
        loaded.then(x => {
            let annot = payload.annotation;
            var vec;

            // Filter to match QC unless requested otherwise.
            if (payload.unfiltered !== false) {
                vec = superstate.quality_control.fetchFilteredAnnotations(annot);
            } else {
                vec = superstate.inputs.fetchAnnotations(annot);
            }

            let extracted = [];
            extractBuffers(vec, extracted);
            postMessage({
                type: "setAnnotation",
                resp: {
                    annotation: annot,
                    values: vec
                },
                msg: "Success: GET_ANNOTATION done"
            }, extracted);
        }).catch(err => {
            console.error(err);
            postError(type, err, fatal)
        });

    } else {
        console.error("MIM:::msg type incorrect")
        postError(type, "Type not defined", fatal)
    }
}
