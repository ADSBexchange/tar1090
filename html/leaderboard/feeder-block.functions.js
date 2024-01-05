function buildChartText(textStr, center, radius) {
  var draw = kendo.drawing;
  var geom = kendo.geometry;

  // The center and radius are populated by now.
  // We can ask a circle geometry to calculate the bounding rectangle for us.
  //
  // https://docs.telerik.com/kendo-ui/api/javascript/geometry/circle/methods/bbox
  var circleGeometry = new geom.Circle(center, radius);
  var bbox = circleGeometry.bbox();

  // Render the text
  //
  // https://docs.telerik.com/kendo-ui/api/javascript/dataviz/drawing/text
  var text = new draw.Text(textStr, [0, 0], {
    font: "30px Verdana,Arial,sans-serif",
    fillOptions: {
      color: "#ff0000",
    },
  });

  // Align the text in the bounding box
  //
  // https://docs.telerik.com/kendo-ui/api/javascript/drawing/methods/align
  // https://docs.telerik.com/kendo-ui/api/javascript/drawing/methods/vAlign
  draw.align([text], bbox, "center");
  draw.vAlign([text], bbox, "center");

  return text;
}
