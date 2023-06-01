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
            return a.source.y - b.source.y;
        }

        function ascendingTargetDepth(a, b) {
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

function drawSankey(graph) {

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
        .sort(function (a, b) { return b.dy - a.dy; });

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
        .attr("height", function (d) { return d.dy; })
        .attr("width", sankey.nodeWidth())
        .style("fill", function (d) { return d.color = color(d.name.replace(/ .*/, "")); })
        .style("stroke", function (d) { return d3.rgb(d.color).darker(2); })
        // Add hover text
        .append("title")
        .text(function (d) { return d.name + "\n" + "There is " + d.value + " stuff in this node"; });

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

        if(v[source] != v[target] && v[target] != '') 
            return {
                "source": v[source],
                "target": v[target],
                "value": "7.0"
            }
    })
}

const checkNodesAndLinks = (arr) => {
}

const getNodes = (arr) => {
    return arr.map(v => { return { "name": v } })
}

fetch('/get_data').then(res => res.json()).then(responseData => {

    let testData =
    {
        "links": [
            { "source": "Agricultural Energy Use", "target": "Carbon Dioxide", "value": "1.4" },
            { "source": "Agriculture", "target": "Agriculture Soils", "value": "5.2" },
            { "source": "Agriculture", "target": "Livestock and Manure", "value": "5.4" },
            { "source": "Agriculture", "target": "Other Agriculture", "value": "1.7" },
            { "source": "Agriculture", "target": "Rice Cultivation", "value": "1.5" },
            { "source": "Agriculture Soils", "target": "Nitrous Oxide", "value": "5.2" },
            { "source": "Air", "target": "Carbon Dioxide", "value": "1.7" },
            { "source": "Aluminium Non-Ferrous Metals", "target": "Carbon Dioxide", "value": "1.0" },
            { "source": "Aluminium Non-Ferrous Metals", "target": "HFCs - PFCs", "value": "0.2" },
            { "source": "Cement", "target": "Carbon Dioxide", "value": "5.0" },
            { "source": "Chemicals", "target": "Carbon Dioxide", "value": "3.4" },
            { "source": "Chemicals", "target": "HFCs - PFCs", "value": "0.5" },
            { "source": "Chemicals", "target": "Nitrous Oxide", "value": "0.2" },
            { "source": "Coal Mining", "target": "Carbon Dioxide", "value": "0.1" },
            { "source": "Coal Mining", "target": "Methane", "value": "1.2" },
            { "source": "Commercial Buildings", "target": "Carbon Dioxide", "value": "6.3" },
            { "source": "Deforestation", "target": "Carbon Dioxide", "value": "10.9" },
            { "source": "Electricity and heat", "target": "Agricultural Energy Use", "value": "0.4" },
            { "source": "Electricity and heat", "target": "Aluminium Non-Ferrous Metals", "value": "0.4" },
            { "source": "Electricity and heat", "target": "Cement", "value": "0.3" },
            { "source": "Electricity and heat", "target": "Chemicals", "value": "1.3" },
            { "source": "Electricity and heat", "target": "Commercial Buildings", "value": "5.0" },
            { "source": "Electricity and heat", "target": "Food and Tobacco", "value": "0.5" },
            { "source": "Electricity and heat", "target": "Iron and Steel", "value": "1.0" },
            { "source": "Electricity and heat", "target": "Machinery", "value": "1.0" },
            { "source": "Electricity and heat", "target": "Oil and Gas Processing", "value": "0.4" },
            { "source": "Electricity and heat", "target": "Other Industry", "value": "2.7" },
            { "source": "Electricity and heat", "target": "Pulp - Paper and Printing", "value": "0.6" },
            { "source": "Electricity and heat", "target": "Residential Buildings", "value": "5.2" },
            { "source": "Electricity and heat", "target": "T and D Losses", "value": "2.2" },
            { "source": "Electricity and heat", "target": "Unallocated Fuel Combustion", "value": "2.0" },
            { "source": "Energy", "target": "Electricity and heat", "value": "24.9" },
            { "source": "Energy", "target": "Fugitive Emissions", "value": "4.0" },
            { "source": "Energy", "target": "Industry", "value": "14.7" },
            { "source": "Energy", "target": "Other Fuel Combustion", "value": "8.6" },
            { "source": "Energy", "target": "Transportation", "value": "14.3" },
            { "source": "Food and Tobacco", "target": "Carbon Dioxide", "value": "1.0" },
            { "source": "Fugitive Emissions", "target": "Coal Mining", "value": "1.3" },
            { "source": "Fugitive Emissions", "target": "Oil and Gas Processing", "value": "3.2" },
            { "source": "Harvest \/ Management", "target": "Carbon Dioxide", "value": "1.3" },
            { "source": "Industrial Processes", "target": "Aluminium Non-Ferrous Metals", "value": "0.4" },
            { "source": "Industrial Processes", "target": "Cement", "value": "2.8" },
            { "source": "Industrial Processes", "target": "Chemicals", "value": "1.4" },
            { "source": "Industrial Processes", "target": "Other Industry", "value": "0.5" },
            { "source": "Industry", "target": "Aluminium Non-Ferrous Metals", "value": "0.4" },
            { "source": "Industry", "target": "Cement", "value": "1.9" },
            { "source": "Industry", "target": "Chemicals", "value": "1.4" },
            { "source": "Industry", "target": "Food and Tobacco", "value": "0.5" },
            { "source": "Industry", "target": "Iron and Steel", "value": "3.0" },
            { "source": "Industry", "target": "Oil and Gas Processing", "value": "2.8" },
            { "source": "Industry", "target": "Other Industry", "value": "3.8" },
            { "source": "Industry", "target": "Pulp - Paper and Printing", "value": "0.5" },
            { "source": "Iron and Steel", "target": "Carbon Dioxide", "value": "4.0" },
            { "source": "Land Use Change", "target": "Deforestation", "value": "10.9" },
            { "source": "Land Use Change", "target": "Harvest \/ Management", "value": "1.3" },
            { "source": "Landfills", "target": "Methane", "value": "1.7" },
            { "source": "Livestock and Manure", "target": "Methane", "value": "5.1" },
            { "source": "Livestock and Manure", "target": "Nitrous Oxide", "value": "0.3" },
            { "source": "Machinery", "target": "Carbon Dioxide", "value": "1.0" },
            { "source": "Oil and Gas Processing", "target": "Carbon Dioxide", "value": "3.6" },
            { "source": "Oil and Gas Processing", "target": "Methane", "value": "2.8" },
            { "source": "Other Agriculture", "target": "Methane", "value": "1.4" },
            { "source": "Other Agriculture", "target": "Nitrous Oxide", "value": "0.3" },
            { "source": "Other Fuel Combustion", "target": "Agricultural Energy Use", "value": "1.0" },
            { "source": "Other Fuel Combustion", "target": "Commercial Buildings", "value": "1.3" },
            { "source": "Other Fuel Combustion", "target": "Residential Buildings", "value": "5.0" },
            { "source": "Other Fuel Combustion", "target": "Unallocated Fuel Combustion", "value": "1.8" },
            { "source": "Other Industry", "target": "Carbon Dioxide", "value": "6.6" },
            { "source": "Other Industry", "target": "HFCs - PFCs", "value": "0.4" },
            { "source": "Pulp - Paper and Printing", "target": "Carbon Dioxide", "value": "1.1" },
            { "source": "Rail - Ship and Other Transport", "target": "Carbon Dioxide", "value": "2.5" },
            { "source": "Residential Buildings", "target": "Carbon Dioxide", "value": "10.2" },
            { "source": "Rice Cultivation", "target": "Methane", "value": "1.5" },
            { "source": "Road", "target": "Carbon Dioxide", "value": "10.5" },
            { "source": "T and D Losses", "target": "Carbon Dioxide", "value": "2.2" },
            { "source": "Transportation", "target": "Air", "value": "1.7" },
            { "source": "Transportation", "target": "Rail - Ship and Other Transport", "value": "2.5" },
            { "source": "Transportation", "target": "Road", "value": "10.5" },
            { "source": "Unallocated Fuel Combustion", "target": "Carbon Dioxide", "value": "3.0" },
            { "source": "Unallocated Fuel Combustion", "target": "Methane", "value": "0.4" },
            { "source": "Unallocated Fuel Combustion", "target": "Nitrous Oxide", "value": "0.4" },
            { "source": "Waste", "target": "Landfills", "value": "1.7" },
            { "source": "Waste", "target": "Waste water - Other Waste", "value": "1.5" },
            { "source": "Waste water - Other Waste", "target": "Methane", "value": "1.2" },
            { "source": "Waste water - Other Waste", "target": "Nitrous Oxide", "value": "0.3" }
        ],
        "nodes": [
            { "name": "Energy" },
            { "name": "Industrial Processes" },
            { "name": "Electricity and heat" },
            { "name": "Industry" },
            { "name": "Land Use Change" },
            { "name": "Agriculture" },
            { "name": "Waste" },
            { "name": "Transportation" },
            { "name": "Other Fuel Combustion" },
            { "name": "Fugitive Emissions" },
            { "name": "Road" }, { "name": "Air" },
            { "name": "Rail - Ship and Other Transport" },
            { "name": "Residential Buildings" },
            { "name": "Commercial Buildings" },
            { "name": "Unallocated Fuel Combustion" },
            { "name": "Iron and Steel" },
            { "name": "Aluminium Non-Ferrous Metals" },
            { "name": "Machinery" },
            { "name": "Pulp - Paper and Printing" },
            { "name": "Food and Tobacco" },
            { "name": "Chemicals" },
            { "name": "Cement" },
            { "name": "Other Industry" },
            { "name": "T and D Losses" },
            { "name": "Coal Mining" },
            { "name": "Oil and Gas Processing" },
            { "name": "Deforestation" },
            { "name": "Harvest \/ Management" },
            { "name": "Agricultural Energy Use" },
            { "name": "Agriculture Soils" },
            { "name": "Livestock and Manure" },
            { "name": "Rice Cultivation" },
            { "name": "Other Agriculture" },
            { "name": "Landfills" },
            { "name": "Waste water - Other Waste" },
            { "name": "Carbon Dioxide" },
            { "name": "HFCs - PFCs" },
            { "name": "Methane" },
            { "name": "Nitrous Oxide" }
        ]
    }

    let graph = {
        "links": [
            { "source": "2/2/2023", "target": "7/2/2023", "value": "5.0" },
            { "source": "2/2/2023", "target": "7/2/2023", "value": "5.0" },
            { "source": "7/2/2023", "target": "31/03/2023", "value": " 5.0" },
        ],
        "nodes": [

            { "name": "2/2/2023" },
            { "name": "7/2/2023" },
            { "name": "31/03/2023" }

        ]
    }




    let dummyData = {
        "links": [
            { "source": "2/2/2023", "target": "7/2/2023", "value": "5.0" },
            { "source": "2/2/2023", "target": "7/2/2023", "value": "5.0" },
            { "source": "7/2/2023", "target": "11/1/2022", "value": "5.0" },
            { "source": "28/10/2022", "target": "11/5/2021", "value": "5.0" },
        ],
        "nodes": [
            { "name": "28/10/2022" },
            { "name": "12/9/2022" },
            { "name": "2/2/2023" },
            { "name": "11/1/2022" },
            { "name": "21/01/2022" },
            { "name": "21/05/2021" },
            { "name": "2/3/2022" },
            { "name": "11/5/2021" },
            { "name": "7/10/2022" },
            { "name": "7/9/2021" },
            { "name": "11/5/2022" },
            { "name": "25/05/2022" },
            { "name": "14/03/2023" },
            { "name": "9/8/2022" },
            { "name": "8/9/2022" },
            { "name": "18/07/2022" },
            { "name": "30/10/2022" },
            { "name": "7/2/2023" },
            { "name": "23/03/2022" },
            { "name": "10/11/2022" },
            { "name": "30/08/2022" },
            /* { "name": "1/9/2022" },
           { "name": "23/08/2021" },
           { "name": "14/06/2017" },
           { "name": "26/10/2021" },
           { "name": "24/01/2022" },
           { "name": "17/10/2022" },
           { "name": "15/06/2021" },
           { "name": "5/8/2022" },
           { "name": "22/06/2022" },
           { "name": "18/05/2022" },
           { "name": "4/4/2023" },
           { "name": "7/2/2023" },
           { "name": "14/07/2022" },
           { "name": "15/11/2022" },
           { "name": "2/5/2022" },
           { "name": "2/11/2022" },
           { "name": "17/08/2022" },
           { "name": "6/9/2022" },
           { "name": "8/11/2018" },
           { "name": "17/02/2023" },
           { "name": "18/04/2023" },
           { "name": "30/10/2020" },
           { "name": "21/06/2022" },
           { "name": "24/05/2023" },
           { "name": "14/04/2023" },
           { "name": "2/2/2023" },
           { "name": "7/2/2023" },
           { "name": "7/2/2023" },
           { "name": "21/04/2023" },
           { "name": "17/03/2023" },
           { "name": "24/05/2021" },
           { "name": "16/05/2023" },
           { "name": "19/04/2023" },
           { "name": "3/5/2023" },
           { "name": "3/3/2023" },
           { "name": "8/2/2023" },
           { "name": "2/2/2023" },
           { "name": "15/05/2023" },
           { "name": "10/2/2023" },
           { "name": "10/3/2023" },
           { "name": "21/02/2023" },
           { "name": "21/02/2023" },
           { "name": "3/2/2023" },
           { "name": "15/02/2023" },
           { "name": "9/2/2023" },
           { "name": "25/01/2022" },
           { "name": "26/03/2023" },
           { "name": "8/2/2023" },
           { "name": "11/5/2023" },
           { "name": "3/5/2023" },
           { "name": "14/04/2023" },
           { "name": "22/02/2023" },
           { "name": "10/2/2023" },
           { "name": "15/05/2023" },
           { "name": "2/5/2023" },
           { "name": "7/2/2023" },
           { "name": "19/04/2023" },
           { "name": "26/03/2023" },
           { "name": "9/5/2023" },
           { "name": "18/04/2023" },
           { "name": "3/2/2023" },
           { "name": "14/02/2023" },
           { "name": "10/2/2023" },
           { "name": "25/05/2023" } */


        ]
    }

    let leadCreatedUniqueDates = responseData.map((o, i) => o['Created Date']).filter(onlyUnique)
    let oppCreatedUniqueDates = responseData.map((o, i) => o['Converted Date']).filter(onlyUnique)
    let oppClosedUniqueDates = responseData.map((o, i) => o['Oppt Close Date']).filter(onlyUnique).filter(v => v != "")

    // console.log('opp close : ', oppClosedUniqueDates)

    let leadNodes = {
        "links": [  ...getLinks(responseData, "Created Date", "Converted Date"), 
                    ...getLinks(responseData, "Converted Date", "Oppt Close Date")
                ].filter(v => v != null),

        "nodes": [
            ...getNodes(leadCreatedUniqueDates),
            ...getNodes(oppCreatedUniqueDates),
            ...getNodes(oppClosedUniqueDates)
        ].map(k => k['name']).filter(onlyUnique).map(v => { return { "name": v } })
    }

    let miniLeads = {
                        "links": leadNodes['links'],  //.slice(0,65),
                        "nodes": leadNodes['nodes']
                    }

    console.log("Freaking Main Leads : ", leadNodes)
    console.log("Default Dummy Data : ", dummyData)
    console.log("Default Graph Data : ", graph)

    console.log("dup nodes : ", leadNodes['nodes'])

    // console.log('%csankey-new.js line:703 error found in ', 'color: red;', leadNodes['links'][45] );

    // drawSankey(graph)
    // drawSankey(dummyData)
    // drawSankey(testData)
    // drawSankey(leadNodes)
    drawSankey(miniLeads)




});
