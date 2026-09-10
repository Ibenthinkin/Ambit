## Landing

-looks fine for now but there's no slideshow or anything.  the copy is terrible and we should probably actually explain what the heck it is and does.

## Onboarding

-there should be waaay more tpoics to get started in there, the sample ones are bascially all the same so even before we develop the whole interview feature we should get some more diverse topics or tags to choose from. even just for testing.

## Feed

-the collumns and resizing the screen looks good.  snappy

## Tiles

-the hover zoom is barely visible and clunky.  it works nbut we need to change it later. and i definitely don't see an outline or highlight indicator of any kind

## Item sheet as dialog
-enter opens the item but escape doesnt close it and bring you back to your place in the feed -it should.
-right click opens the item sheet
-theres no option to make a new collection on the item sheet when you right click on a pciture in the feed. there should be.
-maybe we also add the save/share menu in there as well.

## item page
-item page looks close to what we speced but the photos should be bigger.
-escape key should take you back to the spot in the feed you came from
-there doesnt need to be a modal with the details for the item.  It can all just be underneath the item with the rest of the info.  visible on scroll down.  the way it is now make the UI clunky because the location of a tap make too much differnece in the response.  A tap or pressing enter should bring up the gallery view.
-let's ditch the rounded corners on the hero images in every view


## Gallery
-We can get rid of the tap for more details view entirely, from the phone version as well. that info can just go below the information that come up with you tap once.  just scroll down to see it
-Pictures need to be bigger, as big as they can appear especially if the aspect ration is similar to that of the phone screen, if that's the case it should take up the whole screen.
-i dont think we need to center the hero, let's try it with just a small bit of padding on top, or maybe even none at all
-theres no button to make a new collection in the saveimage modal
-moving the mose should make the title and UI fade in just like a click would

-on the phone view a tap should bring up the title and UI. and then a scroll down just shows the item's page.  if the hero image is square then the title and UI buttons can appear below it, but if it's an aspect ration close to the phone's screen they can just hover over the bottom of the image.  obviously another tap dismisses that stuff.  they should fade in and out gently
-on the phone view a quick swipe up or down should return us to the feed where we left off

## List screens
-they adhere to the spec but I dont like the way they look at all

## Landing
-the logo glyph doesnt open or close anything at all and the slideshow in the background doesnt change at all, not on clicks or arrows.  clicking the background, or using any of the arrow keys should change the image.

## Redesign
-the UI buttons on the phone sixed version need to be bigger and fatter, and when we switch to the gallery or item views and the share button appears, instead of being within the same pill shaped container it should be it's own free floating round button, detached but aligned horizontally and centered on the remaining distance between the main menu bar and the edge of the screen on the right side.  this is how the buttons look in ios photos and many other apps. I will incldude a refernce photo @docs/design_update_3/photos/PhoneUIBarReference.PNG

-instead of having the same UI buttons/ menu on phone and desktop versions be the same, on the desktop and most likely on the tablet size, I want to move the UI bar to a fixed screen position on the right side.  the three or four buttons will be inline vertically instead of horizontally.  they should be a bit bigger than on the phone and have a bit more space between. clicking will open a modal floating next to the button. It should look sort of like in the reference photo @docs/design_update_3/photos/sideMenuButtonReference.png, except floating to the left of it, instead of below, and ofcourse the buttons will be located down the right side.  we can use the current menus/options we have for now.

-the feed should have transparent hover-over menus to add an item to the collection, just like in the reference photos @docs/design_update_3/photos/hoverOverFeedItem.png.  where is says "electronics" is the category and the button says save but we can just use our save glyph instead.  that should apear on hover over.  and here's a reference photo of the hover menu on that item clicked @docs/design_update_3/photos/clickOnHoverOverFeedItem.png


## One more thing
In addition to adding more topics and choice to the onboarding, we need to build out the page that allows you to add/remove topics.  it should include everyhthing we have.  I need to start testing the feel of the associations and drifts i can only do that by switching things on and off.  we should also seed the database with a dozen or so fake users that i can log in as for testing.  each one should have unique, or kind of unique set of interests that fit some kinda profile of a potential user. different age, gender, location, taste, profession.  i know we dont collect those data about users at this time but make me a table in here with 20 different pretend people, complete with all that basic demographic info that user accounts normally collect.  Ultimately we want to make a simple and transparent algorithm that shows people what they actually want, not what a computer thinks might capture their attention/spike their emotions.  but this does meant that we will probably want to collect some data so that we can recommend new things and guide the drift.
