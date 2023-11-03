//This function runs when the left hand navigation changes or the search functionality is used. Resets flight activity block.
//Runs small check to see if full details is set, if it is, opens the window.
function resetFunction() {
  if (adsbexchange) {
    resetFlightPanel();

    //If this variable is set, the user is trying to see the full details page. Once the infoblock is closed, this mutation will trigger
    if (fullDetails) {
      jQuery("#full_details_window").show(
        "slide",
        { direction: "left", queue: false },
        800
      );
      fullDetails = false;
    }
  }
}
function returnGlobalCache() {
  return g;
}
function setPlaneSpottingAPI() {
  return planespottingAPI;
}
function setPlaneSpottersAPI() {
  return planespottersAPI;
}

//Closes flight activity panel to reset user view.
function resetFlightPanel() {
  jQuery("#takeoff_landings_block").hide();
  jQuery("#takeoff_landings_block").empty();
  jQuery("#flight_activity_expand").attr("class", "icon icon_down");
  jQuery("#full_details_window").hide();
}

//Full details button click. This checks for selected plane and then updates details iframe accordingly. 
//Also sets fullDetails to true so that when the reset function is clicked, it will open the sliding panel.
jQuery(".full_detail").on("click", function () { 
    if (SelectedPlane) {
      if (SelectedPlane.icao) {
        let icao = SelectedPlane.icao;
  
        jQuery("#full_details_iframe").attr("src", "details.html?icao=" + icao);
        jQuery("#selected_infoblock").hide(
          "slide",
          { direction: "left", queue: false },
          500,
          function () {
            fullDetails = true;
            toggles["enableInfoblock"].state = false;
          }
        );
      }
    }
});

//This is triggered from the close button for the full details page. It resets the iframe src and toggles state of infoblock to false.
jQuery("#close_full_details").on("click", function () {
  jQuery("#full_details_window").hide(
    "slide",
    { direction: "left" },
    500,
    function () {
      jQuery("#full_details_iframe").attr("src", "");
      toggles["enableInfoblock"].state = true;
    }
  );
});

//This is triggered when a form button is clicked. It just resets the flight activity window, just in case someone had triggered it so that it resets.
jQuery(".formButton").on("click", function () {
  resetFunction();
});
