let nodeValue = "10.0"

d3.sankey = function () {
    var sankey = {},
        nodeWidth = 24,
        nodePadding = 8,
        size = [1, 1],
        nodes = [],
        links = [];

    sankey.nodeWidth = function (_) {
        if (!arguments.length) return nodeWidth;
        nodeWidth = +_;
        return sankey;
    };

    sankey.nodePadding = function (_) {
        if (!arguments.length) return nodePadding;
        nodePadding = +_;
        return sankey;
    };

    sankey.nodes = function (_) {
        if (!arguments.length) return nodes;
        nodes = _;
        return sankey;
    };

    sankey.links = function (_) {
        if (!arguments.length) return links;
        links = _;
        return sankey;
    };

    sankey.size = function (_) {
        if (!arguments.length) return size;
        size = _;
        return sankey;
    };

    sankey.layout = function (iterations) {
        computeNodeLinks();
        computeNodeValues();
        computeNodeBreadths();
        computeNodeDepths(iterations);
        computeLinkDepths();
        return sankey;
    };

    sankey.relayout = function () {
        computeLinkDepths();
        return sankey;
    };

    sankey.link = function () {
        var curvature = .5;

        function link(d) {
            var x0 = d.source.x + d.source.dx,
                x1 = d.target.x,
                xi = d3.interpolateNumber(x0, x1),
                x2 = xi(curvature),
                x3 = xi(1 - curvature),
                y0 = d.source.y + d.sy + d.dy / 2,
                y1 = d.target.y + d.ty + d.dy / 2;
            return "M" + x0 + "," + y0
                + "C" + x2 + "," + y0
                + " " + x3 + "," + y1
                + " " + x1 + "," + y1;
        }

        link.curvature = function (_) {
            if (!arguments.length) return curvature;
            curvature = +_;
            return link;
        };

        return link;
    };

    // Populate the sourceLinks and targetLinks for each node.
    // Also, if the source and target are not objects, assume they are indices.
    function computeNodeLinks() {
        nodes.forEach(function (node) {
            node.sourceLinks = [];
            node.targetLinks = [];
        });
        links.forEach(function (link) {
            var source = link.source,
                target = link.target;
            if (typeof source === "number") source = link.source = nodes[link.source];
            if (typeof target === "number") target = link.target = nodes[link.target];

            source.sourceLinks.push(link);
            target.targetLinks.push(link);
        });
    }

    // Compute the value (size) of each node by summing the associated links.
    function computeNodeValues() {
        nodes.forEach(function (node) {
            node.value = Math.max(
                d3.sum(node.sourceLinks, value),
                d3.sum(node.targetLinks, value)
            );
        });
    }

    // Iteratively assign the breadth (x-position) for each node.
    // Nodes are assigned the maximum breadth of incoming neighbors plus one;
    // nodes with no incoming links are assigned breadth zero, while
    // nodes with no outgoing links are assigned the maximum breadth.
    function computeNodeBreadths() {
        var remainingNodes = nodes,
            nextNodes,
            x = 0;

        while (remainingNodes.length) {
            nextNodes = [];
            remainingNodes.forEach(function (node) {
                node.x = x;
                node.dx = nodeWidth;
                node.sourceLinks.forEach(function (link) {
                    if (nextNodes.indexOf(link.target) < 0) {
                        nextNodes.push(link.target);
                    }
                });
            });
            remainingNodes = nextNodes;
            ++x;
        }

        //
        moveSinksRight(x);
        scaleNodeBreadths((size[0] - nodeWidth) / (x - 1));
    }

    function moveSourcesRight() {
        nodes.forEach(function (node) {
            if (!node.targetLinks.length) {
                node.x = d3.min(node.sourceLinks, function (d) { return d.target.x; }) - 1;
            }
        });
    }

    function moveSinksRight(x) {
        nodes.forEach(function (node) {
            if (!node.sourceLinks.length) {
                node.x = x - 1;
            }
        });
    }

    function scaleNodeBreadths(kx) {
        nodes.forEach(function (node) {
            node.x *= kx;
        });
    }

    function computeNodeDepths(iterations) {
        var nodesByBreadth = d3.nest()
            .key(function (d) { return d.x; })
            .sortKeys(d3.ascending)
            .entries(nodes)
            .map(function (d) { return d.values; });

        //
        initializeNodeDepth();
        resolveCollisions();
        for (var alpha = 1; iterations > 0; --iterations) {
            relaxRightToLeft(alpha *= .99);
            resolveCollisions();
            relaxLeftToRight(alpha);
            resolveCollisions();
        }

        function initializeNodeDepth() {
            var ky = d3.min(nodesByBreadth, function (nodes) {
                return (size[1] - (nodes.length - 1) * nodePadding) / d3.sum(nodes, value);
            });

            nodesByBreadth.forEach(function (nodes) {
                nodes.forEach(function (node, i) {
                    node.y = i;
                    node.dy = node.value * ky;
                });
            });

            links.forEach(function (link) {
                link.dy = link.value * ky;
            });
        }

        function relaxLeftToRight(alpha) {
            nodesByBreadth.forEach(function (nodes, breadth) {
                nodes.forEach(function (node) {
                    if (node.targetLinks.length) {
                        var y = d3.sum(node.targetLinks, weightedSource) / d3.sum(node.targetLinks, value);
                        node.y += (y - center(node)) * alpha;
                    }
                });
            });

            function weightedSource(link) {
                return center(link.source) * link.value;
            }
        }

        function relaxRightToLeft(alpha) {
            nodesByBreadth.slice().reverse().forEach(function (nodes) {
                nodes.forEach(function (node) {
                    if (node.sourceLinks.length) {
                        var y = d3.sum(node.sourceLinks, weightedTarget) / d3.sum(node.sourceLinks, value);
                        node.y += (y - center(node)) * alpha;
                    }
                });
            });

            function weightedTarget(link) {
                return center(link.target) * link.value;
            }
        }

        function resolveCollisions() {
            nodesByBreadth.forEach(function (nodes) {
                var node,
                    dy,
                    y0 = 0,
                    n = nodes.length,
                    i;

                // Push any overlapping nodes down.
                nodes.sort(ascendingDepth);
                for (i = 0; i < n; ++i) {
                    node = nodes[i];
                    dy = y0 - node.y;
                    if (dy > 0) node.y += dy;
                    y0 = node.y + node.dy + nodePadding;
                }

                // If the bottommost node goes outside the bounds, push it back up.
                dy = y0 - nodePadding - size[1];
                if (dy > 0) {
                    y0 = node.y -= dy;

                    // Push any overlapping nodes back up.
                    for (i = n - 2; i >= 0; --i) {
                        node = nodes[i];
                        dy = node.y + node.dy + nodePadding - y0;
                        if (dy > 0) node.y -= dy;
                        y0 = node.y;
                    }
                }
            });
        }

        function ascendingDepth(a, b) {
            return a.y - b.y;
        }
    }

    function computeLinkDepths() {
        nodes.forEach(function (node) {
            node.sourceLinks.sort(ascendingTargetDepth);
            node.targetLinks.sort(ascendingSourceDepth);
        });
        nodes.forEach(function (node) {
            var sy = 0, ty = 0;
            node.sourceLinks.forEach(function (link) {
                link.sy = sy;
                sy += link.dy;
            });
            node.targetLinks.forEach(function (link) {
                link.ty = ty;
                ty += link.dy;
            });
        });

        function ascendingSourceDepth(a, b) {
            // console.log("ascending source depth : ", a.source.y - b.source.y)
            return a.source.y - b.source.y;
        }

        function ascendingTargetDepth(a, b) {
            // console.log("ascending target depth : ", )
            return a.target.y - b.target.y;
        }
    }

    function center(node) {
        return node.y + node.dy / 2;
    }

    function value(link) {
        return link.value;
    }

    return sankey;
};

function drawSankey(graph, arrData) {

    var margin = { top: 10, right: 50, bottom: 50, left: 50 },
        width = window.innerWidth - margin.left - margin.right,
        height = window.innerHeight - margin.top - margin.bottom;

    // append the svg object to the body of the page
    var svg = d3.select("#chart").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");

    // Color scale used
    var color = d3.scaleOrdinal(d3.schemeCategory20);
    // var color = d3.scale.category20();

    // Set the sankey diagram properties
    var sankey = d3.sankey()
        .nodeWidth(36)
        .nodePadding(10)
        .size([width, height]);

    var nodeMap = {};
    graph.nodes.forEach(function (x) { nodeMap[x.name] = x; });
    graph.links = graph.links.map(function (x) {
        return {
            source: nodeMap[x.source],
            target: nodeMap[x.target],
            value: x.value
        };
    });

    sankey
        .nodes(graph.nodes)
        .links(graph.links)
        .layout(1);

    // add in the links
    var link = svg.append("g")
        .selectAll(".link")
        .data(graph.links)
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", sankey.link())
        .style("stroke-width", function (d) { return Math.max(1, d.dy); })
        .sort(function (a, b) { return b.dy - a.dy; });          // uncomment this

    link
        .append("title")
        .attr("class", "nodes")
        .text(function(d) { 
            /* let s = d['source']['name']
            let t = d['target']['name']

            // console.log("s, t : ", s, ", ", t)
            console.log(d)

            let sd = arrData.map(a => {
                                if((a['Created Date'] === s) && (a['Converted Date'] === t)) {
                                    console.log(a)
                                }
                            }) */
            // console.log(sd)
            return d.source.name + " → " + d.target.name + "\n" + "There is/are " + d.value / nodeValue + " record(s) in this link"
         })

    // add in the nodes
    var node = svg.append("g")
        .selectAll(".node")
        .data(graph.nodes)
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; })
        .call(d3.drag()
            .subject(function (d) { return d; })
            .on("start", function () { this.parentNode.appendChild(this); })
            .on("drag", dragmove));

    // add the rectangles for the nodes
    node
        .append("rect")
        .attr("class", "nodes")
        .attr("height", function (d) { return d.dy; })
        .attr("width", sankey.nodeWidth())
        .style("fill", function (d) { return d.color = color(d.name.replace(/ .*/, "")); })
        .style("stroke", function (d) { return d3.rgb(d.color).darker(2); })
        // Add hover text
        .append("title")
        .text(function (d) { return d.name + "\n" + "There is/are " + d.value / nodeValue + " record(s) in this node"; });

    // add in the title for the nodes
    node
        .append("text")
        .attr("x", -6)
        .attr("y", function (d) { return d.dy / 2; })
        .attr("dy", ".35em")
        .attr("text-anchor", "end")
        .attr("transform", null)
        .text(function (d) { return d.name; })
        .filter(function (d) { return d.x < width / 2; })
        .attr("x", 6 + sankey.nodeWidth())
        .attr("text-anchor", "start");

    // the function for moving the nodes
    function dragmove(d) {
        d3.select(this)
            .attr("transform",
                "translate("
                + d.x + ","
                + (d.y = Math.max(
                    0, Math.min(height - d.dy, d3.event.y))
                ) + ")");
        sankey.relayout();
        link.attr("d", sankey.link());
    }
}


// load the data
// d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/data_sankey.json", function(error, graph) {

// Constructs a new Sankey generator with the default settings.

const onlyUnique = (value, index, array) => {
    return array.indexOf(value) === index;
}

const getLinks = (arr, source, target) => {

    return arr.map(v => {
        let s,t

        // For source
        // if(source === "Converted Date") {
        //     s = v[source].replaceAll("/", "-")
        // } else if (source === "Oppt Close Date") {
        //     s = v[source].replaceAll("/", ".")
        // } else {
        //     s = v[source]
        // }

        // For target

        return {
            "source": source == "Converted Date" 
                                ? v[source].replaceAll("/", "-") 
                                : (source == "Oppt Close Date" 
                                    ? v[source].replaceAll("/", ".") 
                                    : v[source]
                                ),

            "target": target == "Converted Date" 
                                ? v[target].replaceAll("/", "-") 
                                : (target == "Oppt Close Date" 
                                    ? v[target].replaceAll("/", ".") 
                                    : v[target]
                                ),
            "value": nodeValue
        }
    })
}


const getNodes = (arr, key) => {

    // console.log("keyyyyy - ", key)

    if (key === "Converted Date")
        return arr.map(v => { return { "name": v.replaceAll("/", "-") } })
    else if (key == "Oppt Close Date")
        return arr.map(v => { return { "name": v.replaceAll("/", ".") } })
    else
        return arr.map(v => { return { "name": v } })
}

fetch('/get_data').then(res => res.json()).then(responseData => {

    console.log("the resp data : ", responseData)

    let graph = {
        "links": [
            { "source": "2023/4/5", "target": "2023/6/2", "value": "5.0" },
            { "source": "2023/2/20", "target": "2023/6/2", "value": "5.0" },
            { "source": "2021/10/21", "target": "2023/6/2", "value": " 5.0" },
            { "source": "2022/03/10", "target": "2023/6/2", "value": " 5.0" },
            { "source": "2023/2/20", "target": "2023/6/2", "value": " 5.0" },
        ].sort((a, b) => new Date(a.source) - new Date(b.source)),
        
        /*.sort((a, b) => {
            if (a.source < b.source) {
                console.log("less : ", a.source)
                return -1;
            }
            if (a.source > b.source) {
                console.log("great : ", a.source)
                return 1;
            }
            return 0;
        }), */

        "nodes": [
            { "name": "2023/2/20" },
            { "name": "2023/4/5" },
            { "name": "2023/1/10" },
            { "name": "2022/03/10" },
            { "name": "2021/10/21" },
            { "name": "2023/6/2" },
        ]
    }

    let leadCreatedUniqueDates = responseData.map((o, i) => o['Created Date']).filter(onlyUnique)
    let oppCreatedUniqueDates = responseData.map((o, i) => o['Converted Date']).filter(onlyUnique)
    let oppClosedUniqueDates = responseData.map((o, i) => o['Oppt Close Date']).filter(onlyUnique).filter(v => v != "")

    let leadStatus = responseData.map((o, i) => o["Lead Status"]).filter(onlyUnique).filter(v => v != "")
    let oppStage = responseData.map((o, i) => o["Oppt Stage"]).filter(onlyUnique).filter(v => v != "")

    // console.log('opp close : ', oppClosedUniqueDates)

    // console.log("test : ", getLinks(responseData, "Created Date", "Converted Date"))

    let leadStartedToLeadStatus = getLinks(responseData, "Created Date", "Lead Status") //.sort((a, b) => new Date(a.source) - new Date(b.source))
    let leadStatusToOppCreated = getLinks(responseData, "Lead Status", "Converted Date")
    let oppCreatedToOppStage = getLinks(responseData, "Converted Date", "Oppt Stage")
    let oppCreatedToOppClosed = getLinks(responseData, "Oppt Stage", "Oppt Close Date")

    let leadNodes = {
        "links": [  ...leadStartedToLeadStatus,
                    ...leadStatusToOppCreated,
                    ...oppCreatedToOppStage,
                    ...oppCreatedToOppClosed
        ].filter(v => v != null),

        "nodes": [
            ...getNodes(leadCreatedUniqueDates, "Created Date"),
            ...getNodes(oppCreatedUniqueDates, "Converted Date"),
            ...getNodes(oppClosedUniqueDates, "Oppt Close Date"),
            ...getNodes(leadStatus, "Lead Status"),
            ...getNodes(oppStage, "Oppt Stage")
        ].map(k => k['name'])
            .filter(onlyUnique)
            .map(v => { return { "name": v } })
    }

    let miniLeads = {
        "links": leadNodes['links'],  //.slice(0,65),
        "nodes": leadNodes['nodes']
    }

    console.log("Freaking Main Leads : ", leadNodes)
    console.log("Default Graph Data : ", graph)
    console.log("First links : ", leadStartedToLeadStatus)

    console.log("dup nodes : ", leadNodes['nodes'])

    // console.log('%csankey-new.js line:703 error found in ', 'color: red;', leadNodes['links'][45] );

    // drawSankey(graph)
    // drawSankey(dummyData)
    // drawSankey(testData)
    // drawSankey(leadNodes)
    // drawSankey(graph)
    drawSankey(miniLeads, responseData)




});
