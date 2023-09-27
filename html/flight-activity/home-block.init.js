jQuery(document).ready(function () {
  jQuery("#feature_landings").tooltip(); //Init jquery tooltip just on flight activity blocks. 

  if (adsbexchange) {
    if (usp.has("icao")) { //This runs just if you pass an icao on page load.
      let icao = usp.get("icao");
      runAPI(icao, false, jQuery("#feature_landings"), function (data) { //Running the API and passing the display function in the callback.
        display_takeoffs_landings_home_block(
          data,
          jQuery("#takeoff_landings_block")
        );
      });
    }
  } else {
    jQuery("#feature_landings").hide();    //Close off features that need the API from sites not adsbexchange.
  }
});

const infoblockNode = document.querySelector("#selected_infoblock"); //Setting up a mutation for the selected infoblock.
let fullDetails = false;

const observer = new MutationObserver(function (mutationList, observer) { //Reset Function to run on change for mutation.
  resetFunction();
});

observer.observe(infoblockNode, { //Observing the mutation.
  attributes: true,
  characterData: true,
  childList: false,
  subtree: false,
  attributeOldValue: false,
  characterDataOldValue: false,
});

