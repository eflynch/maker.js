﻿/// <reference path="combine.ts" />

module MakerJs.model {
    
    /**
     * @private
     */
    interface IPathDirectionalWithPrimeContext extends IPathDirectional {
        primePathId: string;
        primeModel: IModel;
    }

    /**
     * @private
     */
    interface ILinkedPath {
        path: IPathDirectional;
        nextConnection: string;
        reversed: boolean;
    }

    /**
     * @private
     */
    interface IConnectionMap {
        [serializedPoint: string]: ILinkedPath[];
    }

    /**
     * @private
     */
    interface ILoopModel extends IModel {
        insideCount: number;
    }

    /**
     * @private
     */
    function getOpposedLink(linkedPaths: ILinkedPath[], pathContext: IPath): ILinkedPath {
        if (linkedPaths[0].path === pathContext) {
            return linkedPaths[1];
        }
        return linkedPaths[0];
    }

    /**
     * @private
     */
    function getFirstPathFromModel(modelContext: IModel) {
        if (!modelContext.paths) return null;

        for (var pathId in modelContext.paths) {
            return modelContext.paths[pathId];
        }

        return null;
    }

    /**
     * @private
     */
    function collectLoop(loop: ILoopModel, loops: ILoopModel[], detach: boolean) {
        loops.push(loop);

        if (detach) {
            detachLoop(loop);
        }
    }

    /**
     * @private
     */
    function follow(connections: IConnectionMap, loops: ILoopModel[], detach: boolean) {
        //for a given point, follow the paths that connect to each other to form loops
        for (var p in connections) {
            var linkedPaths: ILinkedPath[] = connections[p];

            if (linkedPaths) {

                var loopModel: ILoopModel = {
                    paths: {},
                    insideCount: 0
                };

                var firstLink = linkedPaths[0];
                var currLink = firstLink;

                while (true) {

                    var currPath = <IPathDirectionalWithPrimeContext>currLink.path;
                    currPath.reversed = currLink.reversed;

                    var id = model.getSimilarPathId(loopModel, currPath.primePathId);
                    loopModel.paths[id] = currPath;

                    if (!connections[currLink.nextConnection]) break;

                    var nextLink = getOpposedLink(connections[currLink.nextConnection], currLink.path);
                    connections[currLink.nextConnection] = null;

                    if (!nextLink) break;

                    currLink = nextLink;

                    if (currLink.path === firstLink.path) {

                        //loop is closed
                        collectLoop(loopModel, loops, detach);
                        break;
                    }
                }
            }
        }
    }

    /**
     * Find paths that have common endpoints and form loops.
     * 
     * @param modelContext The model to search for loops.
     * @param options Optional options object.
     * @returns A new model with child models ranked according to their containment within other found loops. The paths of models will be IPathDirectionalWithPrimeContext.
     */
    export function findLoops(modelContext: IModel, options?: IFindLoopsOptions): IModel {
        var loops: ILoopModel[] = [];
        var connections: IConnectionMap = {};
        var result: IModel = { models: {} };

        var opts: IFindLoopsOptions = {
            accuracy: .0001
        };
        extendObject(opts, options);

        function getLinkedPathsOnConnectionPoint(p: IPoint) {
            var serializedPoint = point.serialize(p, opts.accuracy);

            if (!(serializedPoint in connections)) {
                connections[serializedPoint] = [];
            }

            return connections[serializedPoint];
        }

        function spin(callback: (loop: ILoopModel) => void) {
            for (var i = 0; i < loops.length; i++) {
                callback(loops[i]);
            }
        }

        function getModelByDepth(depth: number): IModel {
            var id = depth.toString();

            if (!(id in result.models)) {
                var newModel: IModel = { models: {} };
                result.models[id] = newModel;
            }

            return result.models[id];
        }

        model.originate(modelContext);

        //find loops by looking at all paths in this model
        model.walkPaths(modelContext, function (modelContext: IModel, pathId: string, pathContext: IPath) {

            if (!pathContext) return;

            var safePath = <IPathDirectionalWithPrimeContext>cloneObject(pathContext);
            safePath.primePathId = pathId;
            safePath.primeModel = modelContext;

            //circles are loops by nature
            if (safePath.type == pathType.Circle) {
                var loopModel: ILoopModel = {
                    paths: {},
                    insideCount: 0
                };
                loopModel.paths[pathId] = safePath;

                collectLoop(loopModel, loops, opts.removeFromOriginal);

            } else {
                //gather both endpoints from all non-circle segments
                safePath.endPoints = point.fromPathEnds(safePath);

                for (var i = 2; i--;) {
                    var linkedPath: ILinkedPath = {
                        path: safePath,
                        nextConnection: point.serialize(safePath.endPoints[1 - i], opts.accuracy),
                        reversed: i != 0
                    };
                    getLinkedPathsOnConnectionPoint(safePath.endPoints[i]).push(linkedPath);
                }
            }
        });

        //follow paths to find loops
        follow(connections, loops, opts.removeFromOriginal);

        //now we have all loops, we need to see which are inside of each other
        spin(function (firstLoop: ILoopModel) {

            var firstPath = getFirstPathFromModel(firstLoop);

            if (!firstPath) return;

            spin(function (secondLoop: ILoopModel) {

                if (firstLoop === secondLoop) return;

                if (isPathInsideModel(firstPath, secondLoop)) {
                    firstLoop.insideCount++;
                }

            });
        });

        //now we can group similar loops by their nested level
        spin(function (loop: ILoopModel) {
            var depthModel = getModelByDepth(loop.insideCount);
            var id = countChildModels(depthModel).toString();

            delete loop.insideCount;

            depthModel.models[id] = loop;
        });

        return result;
    }

    /**
     * Remove all paths in a loop model from the model(s) which contained them.
     * 
     * @param loopToDetach The model to search for loops.
     */
    export function detachLoop(loopToDetach: IModel) {
        for (var id in loopToDetach.paths) {
            var pathDirectionalWithOriginalContext = <IPathDirectionalWithPrimeContext>loopToDetach.paths[id];
            var primeModel = pathDirectionalWithOriginalContext.primeModel;
            if (primeModel && primeModel.paths && pathDirectionalWithOriginalContext.primePathId) {
                delete primeModel.paths[pathDirectionalWithOriginalContext.primePathId];
            }
        }
    }
}